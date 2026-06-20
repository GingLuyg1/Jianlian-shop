"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import AdminPageShell from "@/components/admin/AdminPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_ADMIN_SETTINGS,
  type AdminSiteSettings,
  type SiteSettingLog,
} from "@/lib/settings/types";
import { cn } from "@/lib/utils";

const groups = [
  { id: "basic", label: "基础设置" },
  { id: "shop", label: "商城设置" },
  { id: "orders", label: "订单设置" },
  { id: "promotion", label: "推广设置" },
  { id: "notifications", label: "通知设置" },
  { id: "security", label: "安全设置" },
] as const;

type GroupId = (typeof groups)[number]["id"];

type SettingsPayload = {
  settings: AdminSiteSettings;
  logs?: SiteSettingLog[];
  needsMigration?: boolean;
  error?: string;
};

export default function AdminSettingsPage() {
  const [activeGroup, setActiveGroup] = useState<GroupId>("basic");
  const [settings, setSettings] = useState<AdminSiteSettings>(
    DEFAULT_ADMIN_SETTINGS
  );
  const [logs, setLogs] = useState<SiteSettingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    fetch("/api/admin/settings", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | SettingsPayload
          | { error?: string }
          | null;

        if (!mounted) return;

        if (!response.ok) {
          setMessage(payload?.error ?? "系统设置读取失败");
          return;
        }

        const nextPayload = payload as SettingsPayload;
        setSettings(nextPayload.settings ?? DEFAULT_ADMIN_SETTINGS);
        setLogs(nextPayload.logs ?? []);
        if (nextPayload.needsMigration) {
          setMessage("系统设置数据库尚未初始化，请先执行 settings migration。");
        } else if (nextPayload.error) {
          setMessage(nextPayload.error);
        }
      })
      .catch(() => {
        if (mounted) setMessage("系统设置读取失败，请稍后重试。");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const saveSettings = async (patch: Partial<AdminSiteSettings>) => {
    if (saving) return;
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: patch }),
      });
      const payload = (await response.json().catch(() => null)) as
        | SettingsPayload
        | { error?: string; message?: string }
        | null;

      if (!response.ok) {
        const error = payload?.error ?? "保存系统设置失败";
        setMessage(error);
        toast.error(error);
        return;
      }

      const nextPayload = payload as SettingsPayload & { message?: string };
      setSettings(nextPayload.settings ?? settings);
      setLogs(nextPayload.logs ?? []);
      toast.success(nextPayload.message ?? "系统设置已保存");
    } catch {
      setMessage("保存系统设置失败，请稍后重试。");
      toast.error("保存系统设置失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPageShell title="系统设置" description="查看和维护全站基础配置。">
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
            {loading ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
                正在读取系统设置...
              </div>
            ) : null}
            {!loading && activeGroup === "basic" ? (
              <BasicSettings settings={settings} saving={saving} onSave={saveSettings} />
            ) : null}
            {!loading && activeGroup === "shop" ? (
              <ShopSettings settings={settings} saving={saving} onSave={saveSettings} />
            ) : null}
            {!loading && activeGroup === "orders" ? (
              <OrderSettings settings={settings} saving={saving} onSave={saveSettings} />
            ) : null}
            {!loading && activeGroup === "promotion" ? (
              <PromotionSettings settings={settings} saving={saving} onSave={saveSettings} />
            ) : null}
            {!loading && activeGroup === "notifications" ? (
              <UnavailableSettings title="通知设置" />
            ) : null}
            {!loading && activeGroup === "security" ? (
              <SecuritySettings
                settings={settings}
                logs={logs}
                saving={saving}
                onSave={saveSettings}
              />
            ) : null}
          </div>
        </section>
      </div>
    </AdminPageShell>
  );
}

function BasicSettings({
  onSave,
  saving,
  settings,
}: SettingsSectionProps) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => setDraft(settings), [settings]);

  return (
    <div className="w-full max-w-none space-y-5">
      <Field label="站点名称">
        <Input
          value={draft.site_name}
          onChange={(event) => setDraft({ ...draft, site_name: event.target.value })}
        />
      </Field>
      <Field label="站点副标题">
        <Input
          value={draft.site_subtitle}
          onChange={(event) => setDraft({ ...draft, site_subtitle: event.target.value })}
        />
      </Field>
      <Field label="站点状态">
        <NativeSelect
          value={draft.site_status}
          onChange={(value) => setDraft({ ...draft, site_status: value })}
          options={[
            { value: "open", label: "正常开放" },
            { value: "maintenance", label: "维护中" },
          ]}
        />
      </Field>
      <Field label="顶部公告">
        <Textarea
          value={draft.top_announcement}
          onChange={(event) =>
            setDraft({ ...draft, top_announcement: event.target.value })
          }
          rows={4}
        />
      </Field>
      <Field label="客服联系方式">
        <Textarea
          value={draft.support_contact}
          onChange={(event) =>
            setDraft({ ...draft, support_contact: event.target.value })
          }
          rows={5}
        />
      </Field>
      <Button
        variant="outline"
        disabled={saving}
        onClick={() =>
          onSave({
            site_name: draft.site_name,
            site_subtitle: draft.site_subtitle,
            site_status: draft.site_status,
            top_announcement: draft.top_announcement,
            support_contact: draft.support_contact,
          })
        }
      >
        {saving ? "保存中..." : "保存设置"}
      </Button>
    </div>
  );
}

function ShopSettings({ onSave, saving, settings }: SettingsSectionProps) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => setDraft(settings), [settings]);

  return (
    <div className="w-full max-w-none space-y-4">
      <Field label="默认货币">
        <Input
          value={draft.default_currency}
          onChange={(event) =>
            setDraft({ ...draft, default_currency: event.target.value })
          }
        />
      </Field>
      <Field label="货币符号">
        <Input
          value={draft.currency_symbol}
          onChange={(event) =>
            setDraft({ ...draft, currency_symbol: event.target.value })
          }
        />
      </Field>
      <Field label="商品默认每页数量">
        <NativeSelect
          value={String(draft.products_per_page)}
          onChange={(value) =>
            setDraft({ ...draft, products_per_page: Number(value) })
          }
          options={[
            { value: "20", label: "20" },
            { value: "40", label: "40" },
            { value: "60", label: "60" },
          ]}
        />
      </Field>
      <EditableSwitch
        title="是否显示原价"
        description="仅影响前台展示，不修改商品数据库价格。"
        checked={draft.show_original_price}
        onCheckedChange={(checked) =>
          setDraft({ ...draft, show_original_price: checked })
        }
      />
      <EditableSwitch
        title="是否显示库存"
        description="关闭后前台不展示库存数字。"
        checked={draft.show_stock}
        onCheckedChange={(checked) => setDraft({ ...draft, show_stock: checked })}
      />
      <EditableSwitch
        title="是否允许缺货商品展示"
        description="关闭后前台刷新时可按配置隐藏缺货商品。"
        checked={draft.show_sold_out_products}
        onCheckedChange={(checked) =>
          setDraft({ ...draft, show_sold_out_products: checked })
        }
      />
      <Button
        variant="outline"
        disabled={saving}
        onClick={() =>
          onSave({
            default_currency: draft.default_currency,
            currency_symbol: draft.currency_symbol,
            products_per_page: draft.products_per_page,
            show_original_price: draft.show_original_price,
            show_stock: draft.show_stock,
            show_sold_out_products: draft.show_sold_out_products,
          })
        }
      >
        {saving ? "保存中..." : "保存设置"}
      </Button>
    </div>
  );
}

function OrderSettings({ onSave, saving, settings }: SettingsSectionProps) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => setDraft(settings), [settings]);

  return (
    <div className="w-full max-w-none space-y-4">
      <Field label="订单自动取消时间（分钟）">
        <Input
          type="number"
          min={1}
          value={draft.order_auto_cancel_minutes}
          onChange={(event) =>
            setDraft({
              ...draft,
              order_auto_cancel_minutes: Number(event.target.value),
            })
          }
        />
      </Field>
      <EditableSwitch
        title="是否允许用户取消待支付订单"
        description="仅允许取消 pending_payment 或现有业务明确允许的待支付状态。"
        checked={draft.allow_user_cancel_pending_order}
        onCheckedChange={(checked) =>
          setDraft({ ...draft, allow_user_cancel_pending_order: checked })
        }
      />
      <Field label="订单编号前缀">
        <Input
          value={draft.order_no_prefix}
          onChange={(event) =>
            setDraft({ ...draft, order_no_prefix: event.target.value.toUpperCase() })
          }
        />
      </Field>
      <Field label="默认订单备注提示">
        <Textarea
          value={draft.default_order_note_hint}
          onChange={(event) =>
            setDraft({ ...draft, default_order_note_hint: event.target.value })
          }
          rows={3}
        />
      </Field>
      <StatusRow name="自动取消任务" status="尚未启用" />
      <Button
        variant="outline"
        disabled={saving}
        onClick={() =>
          onSave({
            order_auto_cancel_minutes: draft.order_auto_cancel_minutes,
            allow_user_cancel_pending_order:
              draft.allow_user_cancel_pending_order,
            order_no_prefix: draft.order_no_prefix,
            default_order_note_hint: draft.default_order_note_hint,
          })
        }
      >
        {saving ? "保存中..." : "保存设置"}
      </Button>
    </div>
  );
}

function PromotionSettings({
  onSave,
  saving,
  settings,
}: SettingsSectionProps) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => setDraft(settings), [settings]);

  return (
    <div className="w-full max-w-none space-y-4">
      <EditableSwitch
        title="推广功能是否启用"
        description="关闭后前台推广页显示推广功能暂未开放，历史数据不删除。"
        checked={draft.promotion_enabled}
        onCheckedChange={(checked) =>
          setDraft({ ...draft, promotion_enabled: checked })
        }
      />
      <Field label="默认佣金比例（%）">
        <Input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={(draft.promotion_commission_rate * 100).toString()}
          onChange={(event) =>
            setDraft({
              ...draft,
              promotion_commission_rate: Number(event.target.value) / 100,
            })
          }
        />
      </Field>
      <Field label="最低提现金额">
        <Input
          type="number"
          min={0}
          value={draft.promotion_min_withdraw_amount}
          onChange={(event) =>
            setDraft({
              ...draft,
              promotion_min_withdraw_amount: Number(event.target.value),
            })
          }
        />
      </Field>
      <Field label="佣金变为可用的订单状态">
        <NativeSelect
          value={draft.promotion_available_order_status}
          onChange={(value) =>
            setDraft({ ...draft, promotion_available_order_status: value })
          }
          options={[
            { value: "completed", label: "已完成 completed" },
            { value: "processing", label: "处理中 processing" },
          ]}
        />
      </Field>
      <StatusRow name="提现功能" status="暂未开放" />
      <Button
        variant="outline"
        disabled={saving}
        onClick={() =>
          onSave({
            promotion_enabled: draft.promotion_enabled,
            promotion_commission_rate: draft.promotion_commission_rate,
            promotion_min_withdraw_amount: draft.promotion_min_withdraw_amount,
            promotion_available_order_status:
              draft.promotion_available_order_status,
          })
        }
      >
        {saving ? "保存中..." : "保存设置"}
      </Button>
    </div>
  );
}

function SecuritySettings({
  logs,
  onSave,
  saving,
  settings,
}: SettingsSectionProps & { logs: SiteSettingLog[] }) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => setDraft(settings), [settings]);

  return (
    <div className="w-full max-w-none space-y-4">
      <EditableSwitch
        title="是否要求邮箱验证"
        description="仅保存配置，不直接修改 Supabase Auth 核心策略。"
        checked={draft.require_email_verification}
        onCheckedChange={(checked) =>
          setDraft({ ...draft, require_email_verification: checked })
        }
      />
      <EditableSwitch
        title="管理员操作二次确认"
        description="用于后台危险操作的二次确认开关。"
        checked={draft.admin_action_confirm}
        onCheckedChange={(checked) =>
          setDraft({ ...draft, admin_action_confirm: checked })
        }
      />
      <Field label="登录失败提示策略">
        <NativeSelect
          value={draft.login_failure_hint_strategy}
          onChange={(value) =>
            setDraft({ ...draft, login_failure_hint_strategy: value })
          }
          options={[
            { value: "generic", label: "统一提示" },
            { value: "detailed", label: "相对详细提示" },
          ]}
        />
      </Field>
      <StatusRow name="Service Role Key" status="不展示、不编辑" />
      <Button
        variant="outline"
        disabled={saving}
        onClick={() =>
          onSave({
            require_email_verification: draft.require_email_verification,
            admin_action_confirm: draft.admin_action_confirm,
            login_failure_hint_strategy: draft.login_failure_hint_strategy,
          })
        }
      >
        {saving ? "保存中..." : "保存设置"}
      </Button>

      <div className="rounded-xl border">
        <div className="border-b px-4 py-3 text-sm font-semibold text-slate-950">
          最近 20 条配置变更
        </div>
        {logs.length ? (
          <div className="max-h-72 overflow-y-auto divide-y">
            {logs.map((log) => (
              <div key={log.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-800">{log.setting_key}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(log.updated_at).toLocaleString("zh-CN")}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  已记录旧值与新值，敏感密钥不进入系统设置。
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-sm text-slate-500">
            暂无配置变更记录
          </div>
        )}
      </div>
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

type SettingsSectionProps = {
  settings: AdminSiteSettings;
  saving: boolean;
  onSave: (settings: Partial<AdminSiteSettings>) => void;
};

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function NativeSelect({
  onChange,
  options,
  value,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function EditableSwitch({
  checked,
  description,
  onCheckedChange,
  title,
}: {
  checked: boolean;
  description: string;
  onCheckedChange: (checked: boolean) => void;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border p-4">
      <div>
        <div className="text-sm font-medium text-slate-950">{title}</div>
        <div className="mt-1 text-xs text-slate-500">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function StatusRow({ name, status }: { name: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
      <span className="text-sm text-slate-700">{name}</span>
      <Badge variant="outline" className="shrink-0 text-[10px]">
        {status}
      </Badge>
    </div>
  );
}
