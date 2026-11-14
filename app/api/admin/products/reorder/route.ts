import { POST as reorderCatalogProducts } from "../../catalog/products/reorder/route";

export function POST(request: Request) {
  return reorderCatalogProducts(request);
}
