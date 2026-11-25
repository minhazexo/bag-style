import { mkdir, writeFile } from "node:fs/promises";

type SourceProduct = {
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

const sourceArgument = process.argv[2] || "https://bag-style.com";
const source = new URL(sourceArgument);
const origin = source.origin;
const sitemapQueue = new Set<string>([
  new URL("/sitemap.xml", origin).toString(),
  new URL("/sitemap_index.xml", origin).toString()
]);
const pageQueue = new Set<string>();
const seenSitemaps = new Set<string>();

async function getText(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "BagStyleCatalogImporter/1.0 (+catalog migration)" }
  });
  if (!response.ok) throw new Error("HTTP " + response.status + " at " + url);
  return response.text();
}

function locations(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi))
    .map((match) => match[1].trim().replaceAll("&amp;", "&"));
}

async function discoverSitemaps(): Promise<void> {
  try {
    const robots = await getText(new URL("/robots.txt", origin).toString());
    for (const line of robots.split(/\r?\n/)) {
      const match = line.match(/^\s*sitemap:\s*(\S+)/i);
      if (match) sitemapQueue.add(match[1]);
    }
  } catch {
    // Some stores do not publish robots.txt. Standard sitemap paths are still tried.
  }

  while (sitemapQueue.size > 0 && seenSitemaps.size < 40) {
    const current = sitemapQueue.values().next().value as string;
    sitemapQueue.delete(current);
    if (seenSitemaps.has(current)) continue;
    seenSitemaps.add(current);

    try {
      const xml = await getText(current);
      for (const loc of locations(xml)) {
        if (!loc.startsWith(origin)) continue;
        if (/\.xml(\?.*)?$/i.test(loc)) sitemapQueue.add(loc);
        else pageQueue.add(loc);
      }
    } catch (error) {
      console.warn("Skipping sitemap:", current, String(error));
    }
  }

  if (pageQueue.size === 0) {
    try {
      const html = await getText(origin);
      const hrefs = Array.from(html.matchAll(/href=["']([^"'#]+)["']/gi))
        .map((match) => match[1])
        .map((href) => {
          try { return new URL(href, origin).toString(); } catch { return ""; }
        })
        .filter((url) => url.startsWith(origin));
      for (const url of hrefs) pageQueue.add(url);
      pageQueue.add(origin);
    } catch (error) {
      throw new Error("Could not read the source website. " + String(error));
    }
  }
}

function jsonLdBlocks(html: string): unknown[] {
  const blocks = Array.from(html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  const parsed: unknown[] = [];
  for (const block of blocks) {
    try { parsed.push(JSON.parse(block[1].trim())); } catch { /* malformed JSON-LD is ignored */ }
  }
  return parsed;
}

function flattenProducts(value: unknown, output: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) flattenProducts(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  const node = value as Record<string, unknown>;
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((item) => String(item).toLowerCase() === "product")) output.push(node);
  if (node["@graph"]) flattenProducts(node["@graph"], output);
  return output;
}

function productFromJsonLd(node: Record<string, unknown>, pageUrl: string): SourceProduct | null {
  const name = String(node.name || "").trim();
  if (!name) return null;

  const offerValue = node.offers;
  const offer = Array.isArray(offerValue)
    ? (offerValue[0] as Record<string, unknown> | undefined)
    : (offerValue as Record<string, unknown> | undefined);
  const priceValue = offer?.price ?? offer?.lowPrice;
  const parsedPrice = priceValue == null ? null : Number(String(priceValue).replace(/,/g, ""));
  const imageValue = node.image;
  const images = (Array.isArray(imageValue) ? imageValue : imageValue ? [imageValue] : [])
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") return String((item as Record<string, unknown>).url || (item as Record<string, unknown>).contentUrl || "");
      return "";
    })
    .filter(Boolean)
    .map((imageUrl) => {
      try { return new URL(imageUrl, pageUrl).toString(); } catch { return imageUrl; }
    });

  const page = new URL(pageUrl);
  const slug = page.pathname.replace(/\/+$/, "").split("/").pop() || name.toLowerCase().replace(/\W+/g, "-");
  return {
    source_url: pageUrl,
    name,
    slug,
    description: String(node.description || "").trim(),
    sku: node.sku ? String(node.sku) : null,
    price: parsedPrice != null && Number.isFinite(parsedPrice) ? parsedPrice : null,
    currency: offer?.priceCurrency ? String(offer.priceCurrency) : null,
    availability: offer?.availability ? String(offer.availability).split("/").pop() || null : null,
    category: node.category ? String(node.category) : null,
    images
  };
}

async function main(): Promise<void> {
  console.log("Discovering product pages on " + origin);
  await discoverSitemaps();
  const urls = Array.from(pageQueue).slice(0, 2500);
  console.log("Inspecting " + urls.length + " URLs for Product structured data");

  const products = new Map<string, SourceProduct>();
  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (cursor < urls.length) {
      const pageUrl = urls[cursor++];
      try {
        const html = await getText(pageUrl);
        const nodes = jsonLdBlocks(html).flatMap((value) => flattenProducts(value));
        for (const node of nodes) {
          const product = productFromJsonLd(node, pageUrl);
          if (product) products.set(product.source_url, product);
        }
      } catch {
        // A single unavailable page should not stop the whole catalogue scan.
      }
    }
  });
  await Promise.all(workers);

  const result = Array.from(products.values());
  if (result.length === 0) {
    throw new Error("No Product JSON-LD records were found. The source may block crawling, render products only in JavaScript, or use a catalogue without structured data. Export the catalogue from its CMS or provide product page URLs for a tailored importer.");
  }

  await mkdir("data", { recursive: true });
  await writeFile("data/source-products.json", JSON.stringify(result, null, 2), "utf8");
  console.log("Saved " + result.length + " product records to data/source-products.json");
  console.log("Review the export before importing it from Admin > Products > Import JSON.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});