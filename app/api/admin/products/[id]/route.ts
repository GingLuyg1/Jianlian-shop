import {
  DELETE as deleteProduct,
  GET as getProduct,
  PATCH as patchProduct,
} from "../../catalog/products/[productId]/route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function toCatalogContext(context: RouteContext) {
  return {
    params: context.params.then(({ id }) => ({ productId: id })),
  };
}

export function GET(request: Request, context: RouteContext) {
  return getProduct(request, toCatalogContext(context));
}

export function PATCH(request: Request, context: RouteContext) {
  return patchProduct(request, toCatalogContext(context));
}

export function DELETE(request: Request, context: RouteContext) {
  return deleteProduct(request, toCatalogContext(context));
}
