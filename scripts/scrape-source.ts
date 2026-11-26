import { mkdir, writeFile } from "node:fs/promises";

/**
 * Catalogue importer for WooCommerce storefronts such as https://bag-style.com.
 *
 * The source site blocks its REST API (wp-json), its product sitemaps and its
 * robots-listed sitemap index, so this crawler walks the public shop listing
 * (/shop/, /shop/page/2/, ...) and reads each product page's markup. Schema.org
 * JSON-LD is used when a page provides it; otherwise the standard WooCommerce
 * template classes are parsed.
 */

type CatalogProduct = {
  source_url: string;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  sku: string | null;
  price: number | null;
  compare_at_price: number | null;
  currency: string;
  availability: string | null;
  category: string | null;
  categories: string[];
  tags: string[];
  brand: string | null;
  images: string[];
};

type CatalogCategory = {
  name: string;
  slug: string;
  source_url: string;
  description: string;
  parent: string | null;
  product_count: number | null;
};

const source = new URL(process.argv[2] || "https://bag-style.com");
const origin = source.origin;
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36 BagStyleCatalogImporter/1.0";

const entityMap: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", hellip: "...",
  mdash: "-", ndash: "-", rsquo: "'", lsquo: "'", ldquo: "\"", rdquo: "\"",
  times: "x", middot: ".", deg: "deg", trade: "(TM)", reg: "(R)", copy: "(c)"
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => entityMap[name.toLowerCase()] ?? match);
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function absoluteUrl(value: string, pageUrl: string): string {
  try {
    return decodeEntities(new URL(value, pageUrl).toString());
  } catch {
    return "";
  }
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

async function readUrl(url: string, attempt = 1): Promise<string> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" }
    });
    if (!response.ok) throw new Error("HTTP " + response.status + " at " + url);
    return await response.text();
  } catch (error) {
    // One retry keeps a transient network error from losing a product.
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
      return readUrl(url, attempt + 1);
    }
    throw error;
  }
}

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  }));
}

/* Listing discovery */

function productLinksFromListing(html: string, pageUrl: string): string[] {
  const hrefs = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)).map((match) => absoluteUrl(match[1], pageUrl));
  return unique(hrefs.filter((href) => /\/product\/[^/?#]+\/?$/.test(href) && href.startsWith(origin)));
}

function pagedLinksFromListing(html: string, pageUrl: string): string[] {
  const basePath = new URL(pageUrl).pathname.replace(/\/page\/\d+\/?$/, "/").replace(/\/+$/, "/");
  const hrefs = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']*(?:\/page\/\d+\/?|\?paged=\d+)[^"']*)["']/gi))
    .map((match) => absoluteUrl(match[1], pageUrl));
  // Only follow pagination of the listing being read, never a category or blog archive.
  return unique(hrefs.filter((href) => {
    if (!href.startsWith(origin)) return false;
    const url = new URL(href);
    return url.search === "" && url.pathname.replace(/\/page\/\d+\/?$/, "/") === basePath;
  }));
}

function categoryLinksFromListing(html: string, pageUrl: string): Array<{ name: string; slug: string; url: string }> {
  const found: Array<{ name: string; slug: string; url: string }> = [];
  for (const match of html.matchAll(/href=["']([^"']*\/product-category\/([^"'/?#]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absoluteUrl(match[1], pageUrl);
    const slug = match[2];
    const name = stripTags(match[3]).replace(/\s+/g, " ").trim();
    if (!url || !slug) continue;
    if (/\/feed\/?$/i.test(url)) continue;
    found.push({ name: name || slug, slug, url });
  }
  return found;
}

async function discoverProducts(): Promise<Map<string, string>> {
  const products = new Map<string, string>();
  const listingQueue: string[] = [origin + "/shop/"];
  const visited = new Set<string>();

  while (listingQueue.length && visited.size < 30) {
    const listingUrl = listingQueue.shift() as string;
    if (visited.has(listingUrl)) continue;
    visited.add(listingUrl);
    console.log("Reading listing " + visited.size + ": " + listingUrl);

    let html: string;
    try {
      html = await readUrl(listingUrl);
    } catch (error) {
      console.warn("Skipping listing", listingUrl, String(error));
      continue;
    }

    for (const link of productLinksFromListing(html, listingUrl)) {
      if (!products.has(link)) products.set(link, listingUrl);
    }
    for (const next of pagedLinksFromListing(html, listingUrl)) {
      if (!visited.has(next) && !listingQueue.includes(next)) listingQueue.push(next);
    }
  }

  console.log("Found " + products.size + " product pages across " + visited.size + " shop listings");
  return products;
}

/* Product page parsing */

function jsonLdProduct(html: string): Record<string, unknown> | null {
  for (const block of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(block[1].trim()) as unknown;
      const queue: unknown[] = [parsed];
      while (queue.length) {
        const current = queue.shift();
        if (!current || typeof current !== "object") continue;
        if (Array.isArray(current)) { queue.push(...current); continue; }
        const node = current as Record<string, unknown>;
        const type = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
        if (type.some((entry) => String(entry).toLowerCase() === "product")) return node;
        if (node["@graph"]) queue.push(node["@graph"]);
      }
    } catch {
      // Ignore malformed JSON-LD and fall back to HTML parsing.
    }
  }
  return null;
}

function parseMoney(value: string): number | null {
  const cleaned = decodeEntities(value).replace(/[^\d.,]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function priceBlock(html: string): string {
  const summaryIndex = html.search(/<div[^>]*class="[^"]*summary[^"]*"/i);
  const scope = summaryIndex >= 0 ? html.slice(summaryIndex, summaryIndex + 12000) : html;
  const match = scope.match(/<p[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  return match?.[1] ?? "";
}

function parsePrices(html: string): { price: number | null; compareAt: number | null } {
  const block = priceBlock(html);
  if (!block) return { price: null, compareAt: null };

  const del = block.match(/<del[^>]*>([\s\S]*?)<\/del>/i);
  const ins = block.match(/<ins[^>]*>([\s\S]*?)<\/ins>/i);

  if (ins) {
    return { price: parseMoney(ins[1]), compareAt: del ? parseMoney(del[1]) : null };
  }
  const amounts = Array.from(block.matchAll(/<bdi[^>]*>([\s\S]*?)<\/bdi>/gi)).map((match) => stripTags(match[1]));
  const candidates = (amounts.length ? amounts : [stripTags(block)]).map(parseMoney).filter((value): value is number => value != null);
  return { price: candidates[0] ?? null, compareAt: null };
}

function parseImages(html: string, pageUrl: string): string[] {
  const full = Array.from(html.matchAll(/data-large_image=["']([^"']+)["']/gi)).map((match) => absoluteUrl(match[1], pageUrl));
  const large = Array.from(html.matchAll(/data-src=["']([^"']+)["']/gi)).map((match) => absoluteUrl(match[1], pageUrl));
  const thumb = Array.from(html.matchAll(/<img\b[^>]*class="[^"]*wp-post-image[^"]*"[^>]*>/gi))
    .map((match) => {
      const tag = match[0];
      return tag.match(/data-src=["']([^"']+)["']/i)?.[1] || tag.match(/src=["']([^"']+)["']/i)?.[1] || "";
    })
    .map((value) => absoluteUrl(value, pageUrl));
  const all = unique([...full, ...large, ...thumb]).filter(Boolean);
  const gallery = all.filter((url) => /\.(jpe?g|png|webp|avif)$/i.test(url.split("?")[0]));
  return gallery.length ? gallery : all;
}

function taxonomyTerms(html: string, pageUrl: string, taxonomy: "product-category" | "product_tag" | "brand"): Array<{ name: string; slug: string; url: string }> {
  const terms: Array<{ name: string; slug: string; url: string }> = [];
  const pattern = new RegExp("href=[\"']([^\"']*\\/" + taxonomy + "\\/(([^\"'/?#]+))[^\"']*)[\"'][^>]*>([\\s\\S]*?)<\\/a>", "gi");
  for (const match of html.matchAll(pattern)) {
    const url = absoluteUrl(match[1], pageUrl);
    const name = stripTags(match[3]);
    if (!url || !name) continue;
    if (/\/feed\/?$/i.test(url)) continue;
    terms.push({ name, slug: match[2], url });
  }
  return terms;
}

function availabilityOf(html: string): string | null {
  if (/<p[^>]*class="[^"]*\bstock\b[^"]*out-of-stock/i.test(html)) return "OutOfStock";
  if (/<p[^>]*class="[^"]*\bstock\b[^"]*in-stock/i.test(html)) return "InStock";
  if (/class="[^"]*\boutofstock\b[^"]*"/i.test(html)) return "OutOfStock";
  if (/class="[^"]*\binstock\b[^"]*"/i.test(html)) return "InStock";
  return null;
}

/** Product meta row only; the page-wide category menu must not leak into every product. */
function productMetaTerms(html: string, pageUrl: string, kind: "posted_in" | "tagged_as"): Array<{ name: string; slug: string; url: string }> {
  const block = html.match(new RegExp("<span[^>]*class=\"[^\"]*" + kind + "[^\"]*\"[^>]*>([\\s\\S]*?)<\\/span>", "i"));
  if (!block) return [];
  return taxonomyTerms(block[1], pageUrl, kind === "posted_in" ? "product-category" : "product_tag");
}

function descriptionOf(html: string): { short: string; full: string } {
  const shortMatch = html.match(/<div[^>]*class="[^"]*woocommerce-product-details__short-description[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<form|<\/div>)/i);
  const tabMatch = html.match(/<div[^>]*id="tab-description"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<div[^>]*class="[^"]*related)/i);
  const panelMatch = html.match(/<div[^>]*class="[^"]*woocommerce-Tabs-panel--description[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
  const full = stripTags(tabMatch?.[1] || panelMatch?.[1] || "");
  const short = stripTags(shortMatch?.[1] || "");
  return {
    short: short && short !== full ? short : "",
    full: full || short
  };
}

function slugFromUrl(pageUrl: string): string {
  const path = new URL(pageUrl).pathname.replace(/\/+$/, "");
  return decodeURIComponent(path.split("/").pop() || "");
}

function parseProduct(html: string, pageUrl: string): CatalogProduct | null {
  const ld = jsonLdProduct(html);

  const titleMatch = html.match(/<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  const name = stripTags(titleMatch?.[1] || String(ld?.name || "")).replace(/\s+/g, " ").trim();
  if (!name) return null;

  const priceFromLd = (() => {
    const offerValue = ld?.offers as unknown;
    const offer = Array.isArray(offerValue) ? offerValue[0] : offerValue;
    if (!offer || typeof offer !== "object") return null;
    const record = offer as Record<string, unknown>;
    const raw = record.price ?? record.lowPrice;
    if (raw == null) return null;
    return {
      price: Number(String(raw).replace(/,/g, "")),
      currency: record.priceCurrency ? String(record.priceCurrency) : null
    };
  })();

  const htmlPrices = parsePrices(html);
  const categoryTerms = productMetaTerms(html, pageUrl, "posted_in");
  const categories = unique(categoryTerms
    .filter((term) => /\/product-category\//.test(term.url) && term.slug !== "uncategorized")
    .map((term) => term.name));
  const tags = unique(productMetaTerms(html, pageUrl, "tagged_as").map((term) => term.name));
  const brandBlock = html.match(/<span[^>]*class="[^"]*posted_in[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  const brands = brandBlock ? unique(taxonomyTerms(brandBlock[1], pageUrl, "brand").map((term) => term.name)) : [];
  const description = descriptionOf(html);
  const ldDescription = stripTags(String(ld?.description || ""));
  const skuMatch = html.match(/<span[^>]*class="[^"]*\bsku\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  const ldImages = Array.isArray(ld?.image) ? ld?.image as unknown[] : ld?.image ? [ld.image] : [];
  const structuredImages = ldImages.map((entry) => {
    if (typeof entry === "string") return absoluteUrl(entry, pageUrl);
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      return absoluteUrl(String(record.url || record.contentUrl || ""), pageUrl);
    }
    return "";
  }).filter(Boolean);

  const price = htmlPrices.price ?? priceFromLd?.price ?? null;

  return {
    source_url: pageUrl,
    name,
    slug: slugFromUrl(pageUrl),
    short_description: description.short,
    description: description.full || description.short || ldDescription,
    sku: skuMatch ? (stripTags(skuMatch[1]).replace(/^sku:?\s*/i, "").trim() || null) : (ld?.sku ? String(ld.sku) : null),
    price: price != null && Number.isFinite(price) ? price : null,
    compare_at_price: htmlPrices.compareAt,
    currency: priceFromLd?.currency || "BDT",
    availability: availabilityOf(html),
    category: categories[0] ?? null,
    categories,
    tags,
    brand: brands[0] ?? null,
    images: unique([...parseImages(html, pageUrl), ...structuredImages])
  };
}

/* Category pages */

function parseCategoryPage(html: string, pageUrl: string): CatalogCategory | null {
  const heading = html.match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
    || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const name = stripTags(heading?.[1] || "").replace(/\s+/g, " ").trim();
  if (!name || /^shop$/i.test(name) || /page not found/i.test(name)) return null;

  const descriptionMatch = html.match(/<div[^>]*class="[^"]*term-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const countMatch = html.match(/<p[^>]*class="[^"]*woocommerce-result-count[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  const countText = stripTags(countMatch?.[1] || "");
  const countNumber = countText.match(/(\d+)/);
  const parentMatch = html.match(/<nav[^>]*class="[^"]*woocommerce-breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/nav>/i);
  const crumbs = parentMatch ? stripTags(parentMatch[1]).split(/[/>]/).map((part) => part.trim()).filter(Boolean) : [];

  return {
    name,
    slug: slugFromUrl(pageUrl),
    source_url: pageUrl,
    description: stripTags(descriptionMatch?.[1] || ""),
    parent: crumbs.length > 2 ? crumbs[crumbs.length - 2] : null,
    product_count: countNumber ? Number(countNumber[1]) : null
  };
}

async function main(): Promise<void> {
  console.log("Crawling " + origin);
  const productUrls = await discoverProducts();
  if (!productUrls.size) throw new Error("No product pages were discovered on " + origin + "/shop/.");

  // Category archives are discovered from the listings; product pages add any that are missing.
  const categoryUrls = new Map<string, string>();
  try {
    const listing = await readUrl(origin + "/shop/");
    for (const category of categoryLinksFromListing(listing, origin + "/shop/")) {
      if (!categoryUrls.has(category.slug)) categoryUrls.set(category.slug, category.url);
    }
  } catch (error) {
    console.warn("Could not read the shop listing for category links", String(error));
  }

  const urls = Array.from(productUrls.keys());
  const scraped: CatalogProduct[] = [];
  const failures: string[] = [];
  let done = 0;

  await pool(urls, 4, async (url) => {
    try {
      const html = await readUrl(url);
      const product = parseProduct(html, url);
      if (product) scraped.push(product);
      else failures.push(url + " (no product markup)");
      for (const term of taxonomyTerms(html, url, "product-category")) {
        if (!categoryUrls.has(term.slug)) categoryUrls.set(term.slug, term.url);
      }
    } catch (error) {
      failures.push(url + " (" + String(error) + ")");
    }
    done += 1;
    if (done % 10 === 0 || done === urls.length) console.log("Parsed " + done + "/" + urls.length + " product pages");
  });

  const order = new Map(urls.map((url, index) => [url, index]));
  scraped.sort((a, b) => (order.get(a.source_url) ?? 0) - (order.get(b.source_url) ?? 0));

  const categories: CatalogCategory[] = [];
  for (const [slug, url] of categoryUrls) {
    if (/^uncategorized$/i.test(slug)) continue;
    try {
      const category = parseCategoryPage(await readUrl(url), url);
      if (category) categories.push(category);
    } catch (error) {
      console.warn("Skipping category", slug, String(error));
    }
  }

  await mkdir("data", { recursive: true });
  await writeFile("data/source-products.json", JSON.stringify(scraped, null, 2), "utf8");
  await writeFile("data/source-categories.json", JSON.stringify(categories, null, 2), "utf8");

  const priced = scraped.filter((product) => product.price != null && product.price > 0).length;
  console.log("Exported " + scraped.length + " products (" + priced + " priced) to data/source-products.json");
  console.log("Exported " + categories.length + " categories to data/source-categories.json");
  if (failures.length) console.log("Skipped " + failures.length + " pages:\n" + failures.slice(0, 20).join("\n"));
  if (!priced) throw new Error("No product prices were parsed. The storefront markup may have changed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
