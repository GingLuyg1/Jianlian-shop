export function reserveInventory(inventory, request) {
  const needed = Number(request.quantity);
  if (!Number.isInteger(needed) || needed <= 0) throw new Error("预留数量必须是正整数");

  const alreadyReserved = inventory.filter(
    (item) => item.status === "reserved" && item.reservedOrderId === request.orderId,
  );
  if (alreadyReserved.length >= needed) {
    return { inventory, reserved: alreadyReserved.slice(0, needed), reused: true };
  }

  const candidates = inventory.filter((item) => {
    if (item.status !== "available") return false;
    if (String(item.productId) !== String(request.productId)) return false;
    if (request.skuId === null || request.skuId === undefined) return item.skuId === null || item.skuId === undefined;
    return String(item.skuId) === String(request.skuId);
  });

  if (candidates.length < needed) throw new Error("库存不足");
  const selectedIds = new Set(candidates.slice(0, needed).map((item) => item.id));
  const updated = inventory.map((item) => {
    if (!selectedIds.has(item.id)) return item;
    return {
      ...item,
      status: "reserved",
      reservedOrderId: request.orderId,
      reservedAt: request.now,
    };
  });

  return { inventory: updated, reserved: updated.filter((item) => selectedIds.has(item.id)), reused: false };
}

export function deliverReservedInventory(inventory, request) {
  const alreadyDelivered = inventory.filter(
    (item) => item.status === "delivered" && item.deliveredOrderId === request.orderId,
  );
  if (alreadyDelivered.length >= request.quantity) {
    return { inventory, delivered: alreadyDelivered.slice(0, request.quantity), reused: true };
  }

  const reserved = inventory.filter(
    (item) =>
      item.status === "reserved" &&
      item.reservedOrderId === request.orderId &&
      String(item.productId) === String(request.productId) &&
      ((request.skuId === null || request.skuId === undefined)
        ? item.skuId === null || item.skuId === undefined
        : String(item.skuId) === String(request.skuId)),
  );

  if (reserved.length < request.quantity) throw new Error("没有足够的已预留库存可发货");
  const selectedIds = new Set(reserved.slice(0, request.quantity).map((item) => item.id));
  const updated = inventory.map((item) => {
    if (!selectedIds.has(item.id)) return item;
    return {
      ...item,
      status: "delivered",
      deliveredOrderId: request.orderId,
      deliveredAt: request.now,
    };
  });

  return { inventory: updated, delivered: updated.filter((item) => selectedIds.has(item.id)), reused: false };
}

export function releaseReservation(inventory, orderId) {
  return inventory.map((item) => {
    if (item.status !== "reserved" || item.reservedOrderId !== orderId) return item;
    return {
      ...item,
      status: "available",
      reservedOrderId: null,
      reservedAt: null,
    };
  });
}

export function authorizeAdmin(user) {
  if (!user) return { ok: false, status: 401 };
  if (user.role !== "admin") return { ok: false, status: 403 };
  return { ok: true, status: 200 };
}

export function authorizeOwnedResource(user, ownerId) {
  if (!user) return { ok: false, status: 401 };
  if (user.role === "admin") return { ok: true, status: 200 };
  if (String(user.id) !== String(ownerId)) return { ok: false, status: 403 };
  return { ok: true, status: 200 };
}
