import {
  GET as getCatalogProducts,
  POST as createCatalogProduct,
} from "../catalog/products/route";

export function GET(request: Request) {
  return getCatalogProducts(request);
}

export function POST(request: Request) {
  return createCatalogProduct(request);
}
