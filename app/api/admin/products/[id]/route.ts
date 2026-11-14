import {
  DELETE as deleteProduct,
  GET as getProduct,
  PATCH as patchProduct,
} from "../../catalog/products/[productId]/route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return getProduct(request, { params: Promise.resolve({ productId: id }) });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return patchProduct(request, { params: Promise.resolve({ productId: id }) });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return deleteProduct(request, { params: Promise.resolve({ productId: id }) });
}
