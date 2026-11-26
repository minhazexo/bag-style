import { money, type Category, type Product } from "./lib";

export type NavigateOptions = { replace?: boolean; keepScroll?: boolean };
export type Navigate = (path: string, options?: NavigateOptions) => void;

const STORE_NAME = "Bag Style";
const DEFAULT_IMAGE = "/favicon.png";
const HOME_TITLE = "Bag Style — Carry your story";
const HOME_DESCRIPTION = "Discover thoughtfully designed bags for every day. Shop Bag Style online.";

/** A shareable, crawler-friendly route for one product. */
export function productSharePath(product: Product): string {
  return "/p/" + encodeURIComponent(product.slug || product.id);
}

/** The matching route for one category collection. */
export function categoryPath(category: Category): string {
  return "/c/" + encodeURIComponent(category.slug);
}

export function productShareUrl(product: Product, origin = window.location.origin): string {
  return origin + productSharePath(product);
}

/** The message a customer forwards to a friend. */
export function productShareMessage(product: Product): string {
  return [
    "Have a look at this bag from " + STORE_NAME + ":",
    product.name + " — " + money(product.price),
    productShareUrl(product)
  ].join("\n");
}

/** WhatsApp's "send to any chat" link, used by the share button. */
export function whatsappShareUrl(message: string): string {
  return "https://wa.me/?text=" + encodeURIComponent(message);
}

function summarize(product: Product): string {
  const text = String(product.short_description || product.description || "").replace(/\s+/g, " ").trim();
  return text.length > 150 ? text.slice(0, 147).trimEnd() + "…" : text;
}

function absolute(value: string, origin: string): string {
  if (!value) return origin + DEFAULT_IMAGE;
  try { return new URL(value, origin).href; } catch { return value; }
}

function setMeta(key: "property" | "name", name: string, content: string) {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[${key}="${name}"]`);
  if (!content) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.setAttribute("content", content);
    return;
  }
  const tag = document.createElement("meta");
  tag.setAttribute(key, name);
  tag.setAttribute("content", content);
  document.head.appendChild(tag);
}

type PageMeta = {
  title: string;
  description: string;
  image: string;
  url: string;
  alt?: string;
  type?: "website" | "product";
  price?: number;
};

/** Every route writes the same set of tags, so titles and previews stay in step. */
function applyPageMeta({ title, description, image, url, alt = STORE_NAME, type = "website", price }: PageMeta) {
  document.title = title;
  const entries: Array<["property" | "name", string, string]> = [
    ["name", "description", description],
    ["property", "og:type", type],
    ["property", "og:site_name", STORE_NAME],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:image", image],
    ["property", "og:image:alt", alt],
    ["property", "og:url", url],
    ["property", "product:price:amount", price == null ? "" : String(price)],
    ["property", "product:price:currency", price == null ? "" : "BDT"],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
    ["name", "twitter:image", image]
  ];
  entries.forEach(([key, name, content]) => setMeta(key, name, content));
}

/** Title, description, price and preview image for a product page. */
export function applyProductMeta(product: Product) {
  const origin = window.location.origin;
  const price = money(product.price);
  const summary = summarize(product);
  applyPageMeta({
    title: product.name + " — " + price + " | " + STORE_NAME,
    description: summary
      ? price + " · " + summary
      : product.name + " is " + price + " at " + STORE_NAME + ". Cash on delivery across Bangladesh.",
    image: absolute(product.images?.[0] || "", origin),
    url: productShareUrl(product, origin),
    alt: product.name,
    type: "product",
    price: Number(product.price || 0)
  });
}

/** Title, description and preview tags for a category page. */
export function applyCategoryMeta(category: Category) {
  const origin = window.location.origin;
  applyPageMeta({
    title: category.name + " — Shop " + STORE_NAME + " bags",
    description: (category.description || "").replace(/\s+/g, " ").trim()
      || "Shop " + category.name + " at " + STORE_NAME + ". Cash on delivery across Bangladesh.",
    image: origin + DEFAULT_IMAGE,
    url: origin + categoryPath(category),
    alt: category.name
  });
}

/** Restore the homepage metadata when no product or category is open. */
export function applyHomeMeta() {
  const origin = window.location.origin;
  applyPageMeta({
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    image: origin + DEFAULT_IMAGE,
    url: origin + "/"
  });
}
