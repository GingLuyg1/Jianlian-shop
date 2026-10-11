import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DashboardDateRangeFilter, dashboardPreset, type DashboardDateRange } from "../../components/admin/dashboard/DashboardDateRangeFilter";

function Preview() {
  const [range, setRange] = useState<DashboardDateRange>(() => dashboardPreset("7", "2026-10-11"));
  return <div className="admin-dashboard-v21 mx-auto max-w-[880px] p-5">
    <p className="mb-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">合成浏览器交互测试 · 不连接真实后台或数据库</p>
    <section className="dashboard-panel rounded-2xl p-5">
      <h1 className="mb-4 text-xl font-semibold">日期筛选交互测试</h1>
      <DashboardDateRangeFilter label="经营趋势" value={range} onChange={setRange} />
      <output data-testid="effective-range">{range.from}/{range.to}</output>
    </section>
  </div>;
}

createRoot(document.getElementById("root")!).render(<Preview />);
