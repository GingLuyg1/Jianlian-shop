"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";

const groups = [
  { id: "basic", label: "基础设置" },
  { id: "shop", label: "商城设置" },
  { id: "orders", label: "订单设置" },
  { id: "notifications", label: "通知设置" },
  { id: "security", label: "安全设置" },
] as const;

type GroupId = (typeof groups)[number]["id"];

export default function AdminSettingsPage() {
  const [activeGroup, setActiveGroup] = useState<GroupId>("basic");
  const [message, setMessage] = useState("");

  function handleSaveUnavailable() {
    setMessage("当前设置为只读或暂未开放，未保存任何更改。");
  }

  return (
    <AdminPageShell title="系统设置" description="查看当前后台配置状态。">
      {message ? (
        <div className="mb-3 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {message}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="shrink-0 border-b px-4 py-3 text-sm font-semibold text-slate-950">
            设置分组
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-2">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveGroup(group.id)}
                className={cn(
                  "mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm",
                  activeGroup === group.id
                    ? "bg-slate-900 font-medium text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                )}
              >
                {group.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="shrink-0 border-b px-5 py-4">
            <div className="text-base font-semibold text-slate-950">
              {groups.find((group) => group.id === activeGroup)?.label}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {activeGroup === "basic" ? <BasicSettings onSave={handleSaveUnavailable} /> : null}
            {activeGroup === "shop" ? <ShopSettings onSave={handleSaveUnavailable} /> : null}
            {activeGroup === "orders" ? <OrderSettings onSave={handleSaveUnavailable} /> : null}
            {activeGroup === "notifications" ? <UnavailableSettings title="通知设置" /> : null}
            {activeGroup === "security" ? <SecuritySettings /> : null}
          </div>
        </section>
      </div>
    </AdminPageShell>
  );
}

function BasicSettings({ onSave }: { onSave: () => void }) {
  return (
    <div className="w-full max-w-none space-y-5">
      <Field label="站点名称">
        <Input value="Jianlian 简联" readOnly />
      </Field>
      <Field label="顶部公告">
        <Textarea
          value="请牢记域名 www.jianlian.shop，本站不提供任何中国大陆业务。账号类商品售后期为商品发货 24 小时内。"
          readOnly
          rows={3}
        />
      </Field>
      <Field label="客服联系方式">
        <Input value="在线客服 / Telegram 占位" readOnly />
      </Field>
      <Button variant="outline" onClick={onSave}>保存设置</Button>
    </div>
  );
}

function ShopSettings({ onSave }: { onSave: () => void }) {
  return (
    <div className="w-full max-w-none space-y-4">
      <ReadonlySwitch title="前台下单入口" description="真实订单流程已接入，支付仍未接入真实渠道。" checked />
      <StatusRow name="Supabase Auth" status="已接入" />
      <StatusRow name="profiles 角色权限" status="已接入" />
      <StatusRow name="商品分类" status="已接入" />
      <StatusRow name="商品管理" status="已接入" />
      <Button variant="outline" onClick={onSave}>保存设置</Button>
    </div>
  );
}

function OrderSettings({ onSave }: { onSave: () => void }) {
  return (
    <div className="w-full max-w-none space-y-4">
      <StatusRow name="真实订单表" status="已接入" />
      <StatusRow name="用户订单页" status="已接入" />
      <StatusRow name="管理员订单页" status="已接入" />
      <StatusRow name="微信 / 支付宝 / USDT 支付" status="暂未开放" />
      <StatusRow name="自动发货" status="暂未开放" />
      <Button variant="outline" onClick={onSave}>保存设置</Button>
    </div>
  );
}

function SecuritySettings() {
  return (
    <div className="w-full max-w-none space-y-4">
      <StatusRow name="管理员权限" status="profiles.role = admin" />
      <StatusRow name="管理员邮箱" status="gac000189@gmail.com" />
      <StatusRow name="Service Role Key" status="不在浏览器展示" />
      <StatusRow name=".env.local 前端编辑" status="不允许" />
    </div>
  );
}

function UnavailableSettings({ title }: { title: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed text-center">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <p className="mt-2 text-sm text-slate-500">暂未开放</p>
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ReadonlySwitch({
  checked,
  description,
  title,
}: {
  checked: boolean;
  description: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border p-4">
      <div>
        <div className="text-sm font-medium text-slate-950">{title}</div>
        <div className="mt-1 text-xs text-slate-500">{description}</div>
      </div>
      <Switch checked={checked} disabled />
    </div>
  );
}

function StatusRow({ name, status }: { name: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
      <span className="text-sm text-slate-700">{name}</span>
      <Badge variant="outline" className="shrink-0 text-[10px]">{status}</Badge>
    </div>
  );
}
