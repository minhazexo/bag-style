import { mkdir, writeFile } from "node:fs/promises";

type CatalogProduct = {
  source_url: string;
  name: string;
  slug: string;
  description: string;
  sku: string | null;
  price: number | null;
  currency: string | null;
  availability: string | null;
  category: string | null;
  images: string[];
};

const source = new URL(process.argv[2] || "https://bag-style.com");
const origin = source.origin;
const sitemapQueue = new Set([origin + "/sitemap.xml", origin + "/sitemap_index.xml"]);
const seenSitemaps = new Set<string>();
const pageUrls = new Set<string>();

async function readUrl(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "BagStyleCatalogImporter/1.0" }
  });
  if (!response.ok) throw new Error("HTTP " + response.status + " at " + url);
  return response.text();
}

function readLocations(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi))
    .map((match) => match[1].trim().replaceAll("&amp;", "&"));
}

async function findPages(): Promise<void> {
  try {
    const robots = await readUrl(origin + "/robots.txt");
    for (const line of robots.split(/\r?\n/)) {
      const found = line.match(/^\s*sitemap:\s*(\S+)/i);
      if (found) sitemapQueue.add(found[1]);
    }
  } catch {
    // Sitemap defaults are still checked if robots.txt is unavailable.
  }

  while (sitemapQueue.size && seenSitemaps.size < 40) {
    const url = sitemapQueue.values().next().value as string;
    sitemapQueue.delete(url);
    if (seenSitemaps.has(url)) continue;
    seenSitemaps.add(url);

    try {
      const xml = await readUrl(url);
      for (const loc of readLocations(xml)) {
        if (!loc.startsWith(origin)) continue;
        if (/\.xml(\?.*)?$/i.test(loc)) sitemapQueue.add(loc);
        else pageUrls.add(loc);
      }
    } catch (error) {
      console.warn("Skipping sitemap", url, String(error));
    }
  }

  if (!pageUrls.size) {
    const html = await readUrl(origin);
    const links = Array.from(html.matchAll(/href=["']([^"'#]+)["']/gi))
      .map((match) => match[1]);
    for (const href of links) {
      try {
        const url = new URL(href, origin).toString();
        if (url.startsWith(origin)) pageUrls.add(url);
      } catch {
        // Ignore invalid or unsupported hrefs.
      }
    }
    pageUrls.add(origin);
  }
}

function collectProductNodes(value: unknown, output: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectProductNodes(item, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;

  const node = value as Record<string, unknown>;
  const type = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  if (type.some((item) => String(item).toLowerCase() === "product")) output.push(node);
  if (node["@graph"]) collectProductNodes(node["@graph"], output);
  return output;
}

function extractJsonLd(html: string): unknown[] {
  const blocks = Array.from(html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  return blocks.flatMap((block) => {
    try {
      return [JSON.parse(block[1].trim()) as unknown];
    } catch {
      return [];
    }
  });
}

function makeProduct(node: Record<string, unknown>, pageUrl: string): CatalogProduct | null {
  const name = String(node.name || "").trim();
  if (!name) return null;

  const offerValue = node.offers;
  const offer = Array.isArray(offerValue)
    ? offerValue[0] as Record<string, unknown> | undefined
    : offerValue as Record<string, unknown> | undefined;
  const priceValue = offer?.price ?? offer?.lowPrice;
  const price = priceValue == null ? null : Number(String(priceValue).replace(/,/g, ""));
  const rawImages = Array.isArray(node.image) ? node.image : node.image ? [node.image] : [];
  const images = rawImages.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const image = item as Record<string, unknown>;
      return String(image.url || image.contentUrl || "");
    }
    return "";
  }).filter(Boolean).map((value) => new URL(value, pageUrl).toString());

  const page = new URL(pageUrl);
  return {
    source_url: pageUrl,
    name,
    slug: page.pathname.replace(/\/+$/, "").split("/").pop() || name.toLowerCase().replace(/\W+/g, "-"),
    description: String(node.description || ""),
    sku: node.sku ? String(node.sku) : null,
    price: price != null && Number.isFinite(price) ? price : null,
    currency: offer?.priceCurrency ? String(offer.priceCurrency) : null,
    availability: offer?.availability ? String(offer.availability).split("/").pop() || null : null,
    category: node.category ? String(node.category) : null,
    images
  };
}

async function main(): Promise<void> {
  console.log("Discovering product pages on " + origin);
  await findPages();
  const urls = Array.from(pageUrls).slice(0, 2500);
  console.log("Scanning " + urls.length + " pages for Schema.org Product data");

  const products = new Map<string, CatalogProduct>();
  let cursor = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      try {
        const html = await readUrl(url);
        const nodes = extractJsonLd(html).flatMap((value) => collectProductNodes(value));
        for (const node of nodes) {
          const product = makeProduct(node, url);
          if (product) products.set(product.source_url, product);
        }
      } catch {
        // A failed page does not stop the rest of the crawl.
      }
    }
  }));

  const result = Array.from(products.values());
  if (!result.length) {
    throw new Error("No Product JSON-LD records found. The source may block crawling, render product data with JavaScript, or omit structured data. Export the catalogue from its CMS or provide product page URLs for a tailored importer.");
  }

  await mkdir("data", { recursive: true });
  await writeFile("data/source-products.json", JSON.stringify(result, null, 2), "utf8");
  console.log("Exported " + result.length + " products to data/source-products.json");
  console.log("Review the export and import it from Admin > Products > Import JSON.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});