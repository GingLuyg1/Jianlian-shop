export const PRODUCT_DASHBOARD_SORTS = [
  "recent", "name", "paidOrders_desc", "paidOrders_asc", "units_desc", "units_asc",
];

export function sortProductDashboardRows(rows, sort) {
  const direction = sort.endsWith("_asc") ? 1 : -1;
  return [...rows].sort((a, b) => {
    let comparison = 0;
    if (sort.startsWith("paidOrders_")) comparison = a.paidOrders - b.paidOrders;
    else if (sort.startsWith("units_")) comparison = a.units - b.units;
    else if (sort === "name") comparison = a.name.localeCompare(b.name, "zh-CN");
    else comparison = a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
    if (comparison !== 0) return sort === "name" ? comparison : comparison * direction;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
