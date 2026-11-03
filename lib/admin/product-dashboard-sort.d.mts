export type ProductDashboardSortableRow = {
  id: string;
  name: string;
  updatedAt: string;
  paidOrders: number;
  units: number;
};

export const PRODUCT_DASHBOARD_SORTS: readonly string[];
export function sortProductDashboardRows<T extends ProductDashboardSortableRow>(rows: T[], sort: string): T[];
