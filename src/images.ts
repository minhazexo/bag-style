/**
 * Responsive product images.
 *
 * `scripts/make-image-variants.py` writes <name>-w160.webp, -w480, -w960 and
 * -w1440 next to every product photo in the Supabase `product-images` bucket.
 * The URL convention below is how the storefront finds them; anything outside
 * that bucket (demo photos, local art) is served untouched.
 */
export const IMAGE_VARIANT_WIDTHS = [160, 480, 960, 1440];

const BUCKET_PREFIX = "/storage/v1/object/public/product-images/";
const VARIANT_PATTERN = /-w\d+\.webp$/i;

export function isVariantableImage(src: string): boolean {
  if (!src.includes(BUCKET_PREFIX)) return false;
  const path = src.split("?")[0];
  if (!/\.(jpe?g|png|webp|avif)$/i.test(path)) return false;
  return !VARIANT_PATTERN.test(path);
}

/** `.../0-bag.jpg` + 480 → `.../0-bag-w480.webp`; null when it cannot exist. */
export function imageVariantUrl(src: string, width: number): string | null {
  if (!isVariantableImage(src)) return null;
  const [path, query] = src.split("?");
  const slash = path.lastIndexOf("/");
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return null;
  const base = file.slice(0, dot).replace(VARIANT_PATTERN, "");
  return path.slice(0, slash + 1) + base + "-w" + width + ".webp" + (query ? "?" + query : "");
}

/** srcset for an <img>; empty string when the source has no variants. */
export function imageVariantSrcSet(src: string): string {
  if (!isVariantableImage(src)) return "";
  const candidates: string[] = [];
  for (const width of IMAGE_VARIANT_WIDTHS) {
    const url = imageVariantUrl(src, width);
    if (url) candidates.push(url + " " + width + "w");
  }
  return candidates.join(", ");
}
