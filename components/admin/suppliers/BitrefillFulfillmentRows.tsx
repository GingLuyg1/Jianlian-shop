import type { BitrefillAdminRow } from "@/lib/admin/bitrefill-fulfillment.mjs";

export default function BitrefillFulfillmentRows({ rows }: { rows: BitrefillAdminRow[] }) {
  if (!rows.length) return <p className="rounded-xl border p-6 text-sm text-slate-600">暂无 Bitrefill 采购记录。不会生成演示订单。</p>;
  return <div className="space-y-3">{rows.map((row) => <article key={row.id} className="min-w-0 rounded-xl border bg-white p-4 text-sm">
    <h2 className="break-all font-semibold">采购 {row.id}</h2>
    <p className="mt-2">采购状态：{row.status} · Invoice：<span className="break-all">{row.invoiceId ?? "尚未取得"}</span></p>
    <p className="text-xs text-slate-500">{row.createdAt} {row.errorCode ? `· ${row.errorCode}` : ""}</p>
    {row.manualReview ? <p className="mt-2 rounded-lg bg-orange-50 p-2 text-orange-900">需要人工核对；不得直接重发采购或按 Invoice 完成状态发货。</p> : null}
    <ul className="mt-3 space-y-2">{row.units.map((unit) => <li key={unit.id} className="break-all rounded-lg border p-3">
      <p>项目 {unit.orderItemId} / 单位 {unit.unitIndex}</p>
      <p>商品 {unit.productId} · 套餐 {unit.packageId ?? "未匹配"}</p>
      <p>冻结成本：{unit.cost} {unit.currency}（真实成本未验证）</p>
      <p>履约：{unit.fulfillmentStatus} · Child：{unit.childId ?? "未关联"} / {unit.childStatus}</p>
      <div className="mt-2 flex flex-wrap gap-4 text-orange-700">
        {unit.orderId ? <a className="underline" href={unit.orderNo ? `/admin/orders?search=${encodeURIComponent(unit.orderNo)}` : "/admin/orders"}>订单与人工处理</a> : null}
        {unit.childStatus === "FAILED" || unit.childStatus === "REFUNDED" ? <a className="underline" href="/admin/refunds">退款审核（不自动退款）</a> : null}
      </div>
    </li>)}</ul>
    <details className="mt-3"><summary className="cursor-pointer py-2">最近对账记录（不含卡密）</summary>
      {row.events.length ? <ul>{row.events.map((event, index) => <li key={`${event.checkedAt}-${index}`} className="break-all py-1 text-xs">{event.checkedAt} · {event.status} · {event.resultClass}</li>)}</ul> : <p>暂无对账记录</p>}
    </details>
  </article>)}</div>;
}
