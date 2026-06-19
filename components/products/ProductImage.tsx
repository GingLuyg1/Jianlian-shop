"use client";

import { productImageFallbackSrc, setProductImageFallback } from "./product-ui";
import { cn } from "@/lib/utils";

export default function ProductImage({
  alt,
  className,
  src,
}: {
  alt: string;
  className?: string;
  src?: string | null;
}) {
  return (
    <img
      src={src || productImageFallbackSrc}
      alt={alt}
      loading="lazy"
      onError={(event) => setProductImageFallback(event.currentTarget)}
      className={cn("aspect-square h-full w-full bg-white object-cover", className)}
    />
  );
}
