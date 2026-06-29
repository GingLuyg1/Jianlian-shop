import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

export function productCategoryMetadata(input: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return buildPageMetadata({
    title: input.title,
    description: input.description,
    path: input.path,
  });
}
