import { createRoot } from "react-dom/client";
import DashboardProductData from "../../components/admin/dashboard/DashboardProductData";
import { sortProductDashboardRows } from "../../lib/admin/product-dashboard-sort.mjs";

// Presentation-only browser fixture. Never calls the application or a database.
const names = [
  "Google One Pro 十二个月订阅 · 较长名称验证",
  "AI 工具高级会员组合套餐",
  "Apple ID 数字产品独享账户",
  "ChatGPT Plus 月度服务",
  "国际礼品卡 100 美元",
  "云存储家庭共享年卡",
  "办公软件专业版激活码",
  "音乐流媒体高级会员",
  "设计素材订阅组合包",
  "跨境应用商店礼品卡",
  "独立游戏激活码",
  "在线协作会员年度版",
  "独立游戏豪华版激活码",
  "视频流媒体家庭套餐",
  "云服务器月度订阅",
  "国际漫游数据卡",
  "软件授权年度续费",
  "在线教育会员季卡",
  "数字素材资源包",
  "应用商店礼品卡 50 美元",
  "专业设计工具订阅",
  "网络安全防护服务",
  "团队协作空间升级",
  "智能写作会员服务",
  "电子书阅读年度会员",
  "海外邮箱验证服务",
  "电竞平台钱包礼品卡",
  "国际通讯流量套餐",
  "云盘空间容量升级",
  "移动应用高级版授权",
  "办公模板素材合集",
  "数字会员组合优惠包",
];
const rows = names.map((name, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name, updatedAt: `2026-10-${String(12 - index).padStart(2, "0")}`, paidOrders: (index * 7) % 11, units: (index * 9) % 17, amountCny: null }));
window.fetch = async (input) => {
  const url = new URL(String(input), "http://localhost");
  const from = url.searchParams.get("from")!;
  const to = url.searchParams.get("to")!;
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "10");
  const productId = url.searchParams.get("productId");
  const search = url.searchParams.get("search")?.toLowerCase() ?? "";
  const sort = url.searchParams.get("sort") ?? "paidOrders_desc";
  const filtered = rows.filter((row) => row.name.toLowerCase().includes(search));
  const ranked = sortProductDashboardRows(filtered, sort);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const selected = rows.find((row) => row.id === productId);
  const orderCount = selected?.paidOrders ?? 0;
  const unitCount = selected?.units ?? 0;
  const daily = productId ? Array.from({ length: days }, (_, index) => ({
    date: new Date(Date.parse(`${from}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10),
    paidOrders: index === days - 2 ? Math.floor(orderCount / 3) : index === days - 1 ? orderCount - Math.floor(orderCount / 3) : 0,
    units: index === days - 3 ? Math.floor(unitCount / 2) : index === days - 1 ? unitCount - Math.floor(unitCount / 2) : 0,
  })) : [];
  const payload = { ok: true, from, to, page, pageSize, sort, total: productId ? 1 : filtered.length, rows: productId ? rows.filter((row) => row.id === productId) : ranked.slice((page - 1) * pageSize, page * pageSize), daily };
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
};

const embedded = (window as Window & { __V25_FULL_DASHBOARD?: boolean }).__V25_FULL_DASHBOARD;
createRoot(document.getElementById("root")!).render(embedded ? <DashboardProductData /> : <div className="admin-dashboard-v21 mx-auto max-w-[1350px] p-4"><p className="mb-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">合成商品数据 · 真实 Chrome 组件渲染，仅供布局和弹窗交互验收</p><DashboardProductData /></div>);
