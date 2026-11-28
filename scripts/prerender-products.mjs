/**
 * Writes static entry pages and the crawler files for the store:
 *
 *   dist/p/<slug>/index.html - one per active product, with Product/Offer JSON-LD
 *   dist/c/<slug>/index.html - one per category
 *   dist/sitemap.xml         - home, every product page and every category page
 *   dist/robots.txt          - allows the store, blocks /admin, points at the sitemap
 *
 * WhatsApp, Facebook and Google do not run JavaScript, so a shared or indexed
 * link needs its own title, description, preview image, canonical and product
 * markup in the HTML. Each page still boots the normal React app, which opens
 * the same product or category.
 *
 * Runs after `vite build` (see package.json). A missing Supabase env or a network
 * failure only skips the extra pages; the normal SPA build stays deployable.
 * SITE_URL (or Vercel's production URL) is required for absolute sitemap,
 * canonical and JSON-LD URLs; without it the sitemap is skipped.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const distDir = join(root, "dist");
const MARK_START = "<!-- share-meta:start -->";
const MARK_END = "<!-- share-meta:end -->";
const STORE_NAME = "Bag Bari";

async function loadEnvFile() {
  try {
    const raw = await readFile(join(root, ".env.local"), "utf8");
    const values = {};
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
    return values;
  } catch {
    return {};
  }
}

const fileEnv = await loadEnvFile();
const supabaseUrl = (process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const siteUrl = (
  process.env.SITE_URL
  || fileEnv.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "")
  || ""
).replace(/\/+$/, "");

const taka = new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });
const money = (value) => taka.format(Number(value || 0));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function summarize(product) {
  const raw = clean(product.short_description || product.description || "");
  return raw.length > 150 ? raw.slice(0, 147).trimEnd() + "…" : raw;
}

function absolute(image) {
  if (!image) return siteUrl ? siteUrl + "/favicon.png" : "/favicon.png";
  if (/^https?:\/\//i.test(image)) return image;
  return (siteUrl || "") + image;
}

function isoDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

async function rest(path) {
  const response = await fetch(supabaseUrl + path, {
    headers: { apikey: supabaseKey, Authorization: "Bearer " + supabaseKey }
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    throw new Error("Supabase responded " + response.status + ": " + body);
  }
  return response.json();
}

/** Product + Offer markup, so Google reads the real price and availability. */
function productJsonLd(product, url) {
  const images = (Array.isArray(product.images) ? product.images : []).map(absolute).filter(Boolean);
  const stock = product.stock_quantity == null ? null : Number(product.stock_quantity);
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    // Source copy sometimes starts with its own "Description" label.
    description: clean(product.description || product.short_description || "").replace(/^description\s*[:\-–]?\s*/i, ""),
    sku: product.sku || undefined,
    image: images.length ? images : undefined,
    brand: { "@type": "Brand", name: STORE_NAME },
    category: clean(product.category?.name || "") || undefined,
    url,
    offers: {
      "@type": "Offer",
      url,
      price: Number(product.price || 0).toFixed(2),
      priceCurrency: "BDT",
      availability: stock === 0 ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: STORE_NAME }
    }
  };
  return data;
}

function metaBlock({ title, description, image, url, name, price, canonical, jsonLd }) {
  const rows = [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="${price == null ? "website" : "product"}" />`,
    `<meta property="og:site_name" content="${STORE_NAME}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(name)}" />`
  ];
  if (url) rows.push(`<meta property="og:url" content="${escapeHtml(url)}" />`);
  if (price != null) {
    rows.push(`<meta property="product:price:amount" content="${escapeHtml(String(price))}" />`);
    rows.push(`<meta property="product:price:currency" content="BDT" />`);
  }
  rows.push(
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`
  );
  if (canonical) rows.push(`<link rel="canonical" href="${escapeHtml(canonical)}" />`);
  const block = [MARK_START, ...rows, MARK_END].join("\n    ");
  if (!jsonLd) return block;
  const payload = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  return block + '\n    <script type="application/ld+json">' + payload + "</script>";
}

function render(template, { title, block }) {
  return template
    .replace(/<!-- share-meta:start -->[\s\S]*?<!-- share-meta:end -->/, () => block)
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(title)}</title>`);
}

async function writePage(segments, html) {
  const dir = join(distDir, ...segments);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html, "utf8");
}

function sitemapXml(entries) {
  const rows = entries.map((entry) => {
    const lastmod = entry.lastmod ? "\n    <lastmod>" + escapeXml(entry.lastmod) + "</lastmod>" : "";
    return "  <url>\n    <loc>" + escapeXml(entry.loc) + "</loc>" + lastmod + "\n  </url>";
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...rows,
    "</urlset>",
    ""
  ].join("\n");
}

function robotsTxt() {
  const lines = ["User-agent: *", "Allow: /", "Disallow: /admin"];
  if (siteUrl) lines.push("", "Sitemap: " + siteUrl + "/sitemap.xml");
  return lines.join("\n") + "\n";
}

async function main() {
  const template = await readFile(join(distDir, "index.html"), "utf8");
  const homeTitle = "Bag Bari — Carry your story";
  const homeDescription = "Discover thoughtfully designed bags for every day. Shop Bag Bari online.";

  if (siteUrl) {
    await writeFile(join(distDir, "index.html"), render(template, {
      title: homeTitle,
      block: metaBlock({
        title: homeTitle,
        description: homeDescription,
        image: absolute(""),
        url: siteUrl + "/",
        canonical: siteUrl + "/",
        name: STORE_NAME
      })
    }), "utf8");
  }

  if (!siteUrl) {
    console.warn("[seo] SITE_URL is not set, so the sitemap and canonical links were skipped.");
  }

  // robots.txt does not need the catalogue, so it is written even without Supabase.
  await writeFile(join(distDir, "robots.txt"), robotsTxt(), "utf8");

  if (!supabaseUrl || !supabaseKey) {
    console.warn("[seo] Supabase env vars are missing, so product and category pages were skipped.");
    return;
  }

  const productFields = "slug,name,price,short_description,description,sku,stock_quantity,images,"
    + "updated_at,category_id,category:categories(name)";
  const [products, categories] = await Promise.all([
    rest("/rest/v1/products?select=" + productFields + "&is_active=eq.true&order=created_at.desc"),
    rest("/rest/v1/categories?select=id,slug,name,description,sort_order&order=sort_order.asc")
  ]);

  await rm(join(distDir, "p"), { recursive: true, force: true });
  await rm(join(distDir, "c"), { recursive: true, force: true });

  const productEntries = [];
  for (const product of products) {
    const slug = clean(product.slug);
    if (!slug) continue;

    const price = money(product.price);
    const summary = summarize(product);
    const title = product.name + " — " + price + " | " + STORE_NAME;
    const description = summary
      ? price + " · " + summary
      : product.name + " is " + price + " at " + STORE_NAME + ". Cash on delivery across Bangladesh.";
    const url = siteUrl ? siteUrl + "/p/" + encodeURIComponent(slug) : "";

    await writePage(["p", slug], render(template, {
      title,
      block: metaBlock({
        title,
        description,
        image: absolute(Array.isArray(product.images) ? product.images[0] : ""),
        url,
        canonical: url,
        name: product.name,
        price: Number(product.price || 0),
        jsonLd: url ? productJsonLd(product, url) : null
      })
    }));
    productEntries.push({ loc: url, lastmod: isoDate(product.updated_at) });
  }

  const categoryEntries = [];
  for (const category of categories) {
    const slug = clean(category.slug);
    if (!slug) continue;

    const inCategory = products.filter((product) => product.category_id === category.id);
    const summary = clean(category.description);
    const title = category.name + " — Shop " + STORE_NAME + " bags";
    const url = siteUrl ? siteUrl + "/c/" + encodeURIComponent(slug) : "";

    await writePage(["c", slug], render(template, {
      title,
      block: metaBlock({
        title,
        description: summary
          ? summary.slice(0, 155)
          : "Shop " + category.name + " at " + STORE_NAME + ". Cash on delivery across Bangladesh.",
        image: absolute(inCategory[0]?.images?.[0] || ""),
        url,
        canonical: url,
        name: category.name
      })
    }));
    const newest = inCategory.map((product) => isoDate(product.updated_at)).sort().pop() || "";
    categoryEntries.push({ loc: url, lastmod: newest });
  }

  if (siteUrl) {
    const newest = productEntries.map((entry) => entry.lastmod).sort().pop() || "";
    await writeFile(join(distDir, "sitemap.xml"), sitemapXml([
      { loc: siteUrl + "/", lastmod: newest },
      ...categoryEntries,
      ...productEntries
    ]), "utf8");
  }

  console.log(
    "[seo] Wrote " + productEntries.length + " product pages to dist/p/, "
    + categoryEntries.length + " category pages to dist/c/"
    + (siteUrl ? " and dist/sitemap.xml with " + (productEntries.length + categoryEntries.length + 1) + " URLs." : ".")
  );
}

try {
  await main();
} catch (error) {
  console.warn("[share] Could not prerender product share pages: " + (error instanceof Error ? error.message : String(error)));
}
