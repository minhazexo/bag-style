import { useState } from "react";
import { imageVariantSrcSet, imageVariantUrl, isVariantableImage } from "./images";

/**
 * Product photo with srcset/sizes pointing at the WebP variants.
 *
 * Photos uploaded after the last variant run have no siblings yet, so a failed
 * variant request drops that image back to the original file (and remembers it
 * so the browser does not retry the 404 on every re-render).
 */
const missingVariants = new Set<string>();

type ProductImageProps = {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
};

export function ProductImage({ src, alt, sizes, className, loading, fetchPriority }: ProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const useVariants = failedSrc !== src && !missingVariants.has(src) && isVariantableImage(src);
  const fallback = useVariants ? imageVariantUrl(src, 960) : null;

  return (
    <img
      src={fallback || src}
      srcSet={useVariants ? imageVariantSrcSet(src) || undefined : undefined}
      sizes={useVariants ? sizes : undefined}
      alt={alt}
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      onError={useVariants ? () => { missingVariants.add(src); setFailedSrc(src); } : undefined}
    />
  );
}
