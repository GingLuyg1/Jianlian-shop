export type SupplierUiDefinition = {
  code: string;
  name: string;
  capabilities: readonly string[];
  adminEndpoint: string;
};

// Display-only registry. Fulfillment routing authority remains in lib/providers/core.
export const supplierUiRegistry: readonly SupplierUiDefinition[] = [
  {
    code: "daju",
    name: "大橘AI",
    capabilities: ["余额读取", "商品目录", "商品详情", "自动采购履约", "商品绑定"],
    adminEndpoint: "/api/admin/suppliers/daju",
  },
];

export function getSupplierUiDefinition(code: string | null | undefined) {
  return supplierUiRegistry.find((supplier) => supplier.code === code);
}
