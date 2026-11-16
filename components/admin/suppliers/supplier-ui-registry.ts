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
    capabilities: ["余额读取", "商品目录", "商品详情", "自动采购履约（Canary 门禁）", "商品绑定"],
    adminEndpoint: "/api/admin/suppliers/daju",
  },
  {
    code: "bitrefill",
    name: "Bitrefill",
    capabilities: ["余额读取", "商品目录", "商品详情", "生产采购代码已接入（发布门禁关闭）", "独立目录后台"],
    adminEndpoint: "/api/admin/suppliers/bitrefill",
  },
  {
    code: "kuajingzy",
    name: "跨境资源网",
    capabilities: ["余额读取", "有界商品搜索", "商品详情", "SKU 候选映射", "真实采购未启用"],
    adminEndpoint: "/api/admin/suppliers/kuajingzy",
  },
];

export function getSupplierUiDefinition(code: string | null | undefined) {
  return supplierUiRegistry.find((supplier) => supplier.code === code);
}
