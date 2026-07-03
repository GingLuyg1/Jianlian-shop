"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import AdminPageShell from "@/components/admin/AdminPageShell";
import PaymentSettingsPanel from "@/components/admin/payments/PaymentSettingsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_ADMIN_SETTINGS, type AdminSiteSettings, type SiteSettingLog } from "@/lib/settings/types";
import { cn } from "@/lib/utils";

const groups = [
  { id: "basic", label: "基础信息" },
  { id: "order", label: "订单设置" },
  { id: "contact", label: "联系方式" },
  { id: "maintenance", label: "维护模式" },
  { id: "announcement", label: "公告设置" },
  { id: "legal", label: "协议与政策" },
  { id: "payments", label: "支付设置" },
  { id: "security", label: "安全设置" },
] as const;

type GroupId = (typeof groups)[number]["id"];

type SettingsPayload = {
  settings: AdminSiteSettings;
  logs?: SiteSettingLog[];
  needsMigration?: boolean;
  error?: string;
  message?: string;
};

export default function AdminSettingsPage() {
  const [activeGroup, setActiveGroup] = useState<GroupId>("basic");
  const [settings, setSettings] = useState<AdminSiteSettings>(DEFAULT_ADMIN_SETTINGS);
  const [draft, setDraft] = useState<AdminSiteSettings>(DEFAULT_ADMIN_SETTINGS);
  const [logs, setLogs] = useState<SiteSettingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const contentRef = useRef<HTMLDivElement | null>(null);

  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(draft), [settings, draft]);

  useEffect(() => {
    let mounted = true;
    fetch("/api/admin/settings", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as SettingsPayload | null;
        if (!mounted) return;
        if (!response.ok) {
          setMessage(payload?.error ?? "系统设置读取失败");
          return;
        }
        const nextSettings = payload?.settings ?? DEFAULT_ADMIN_SETTINGS;
        setSettings(nextSettings);
        setDraft(nextSettings);
        setLogs(payload?.logs ?? []);
        if (payload?.needsMigration) setMessage("系统设置数据表尚未初始化，请先执行 settings migration。");
        else if (payload?.error) setMessage(payload.error);
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

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeGroup]);

  function updateDraft(patch: Partial<AdminSiteSettings>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function switchGroup(next: GroupId) {
    if (dirty && !window.confirm("当前设置尚未保存，确定切换分组吗？")) return;
    setDraft(settings);
    setActiveGroup(next);
    setMessage("");
  }

  async function saveSettings(patch: Partial<AdminSiteSettings>) {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: patch }),
      });
      const payload = (await response.json().catch(() => null)) as SettingsPayload | null;
      if (!response.ok) {
        const error = payload?.error ?? "保存系统设置失败";
        setMessage(error);
        toast.error(error);
        return;
      }
      const nextSettings = payload?.settings ?? draft;
      setSettings(nextSettings);
      setDraft(nextSettings);
      setLogs(payload?.logs ?? []);
      toast.success(payload?.message ?? "系统设置已保存");
    } catch {
      setMessage("保存系统设置失败，请稍后重试。");
      toast.error("保存系统设置失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageShell title="系统设置" description="统一管理网站公开配置、订单规则、公告、协议和维护模式。">
      {message ? <div className="mb-3 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{message}</div> : null}
      <div className="grid h-full min-h-0 w-full flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="shrink-0 border-b px-4 py-3 text-sm font-semibold text-slate-950">设置分组</div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-2">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => switchGroup(group.id)}
                className={cn(
                  "mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm",
                  activeGroup === group.id ? "bg-slate-900 font-medium text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                )}
              >
                {group.label}
              </button>
            ))}
          </nav>
        </aside>
        <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="shrink-0 border-b px-5 py-3">
            <div className="text-base font-semibold text-slate-950">{groups.find((group) => group.id === activeGroup)?.label}</div>
          </div>
          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading ? <EmptyPanel>正在读取系统设置...</EmptyPanel> : null}
            {!loading && activeGroup === "basic" ? <BasicSettings settings={draft} saving={saving} onChange={updateDraft} onSave={saveSettings} /> : null}
            {!loading && activeGroup === "order" ? <OrderSettings settings={draft} saving={saving} onChange={updateDraft} onSave={saveSettings} /> : null}
            {!loading && activeGroup === "contact" ? <ContactSettings settings={draft} saving={saving} onChange={updateDraft} onSave={saveSettings} /> : null}
            {!loading && activeGroup === "maintenance" ? <MaintenanceSettings settings={draft} saving={saving} onChange={updateDraft} onSave={saveSettings} /> : null}
            {!loading && activeGroup === "announcement" ? <AnnouncementSettings settings={draft} saving={saving} onChange={updateDraft} onSave={saveSettings} /> : null}
            {!loading && activeGroup === "legal" ? <LegalSettings /> : null}
            {!loading && activeGroup === "payments" ? <PaymentSettingsPanel /> : null}
            {!loading && activeGroup === "security" ? <SecuritySettings settings={draft} logs={logs} saving={saving} onChange={updateDraft} onSave={saveSettings} /> : null}
          </div>
        </section>
      </div>
    </AdminPageShell>
  );
}

type SettingsSectionProps = {
  settings: AdminSiteSettings;
  saving: boolean;
  onChange: (patch: Partial<AdminSiteSettings>) => void;
  onSave: (settings: Partial<AdminSiteSettings>) => void;
};

function BasicSettings({ settings, saving, onChange, onSave }: SettingsSectionProps) {
  return (
    <Section>
      <Field label="网站名称"><Input value={settings.site_name} onChange={(e) => onChange({ site_name: e.target.value })} /></Field>
      <Field label="网站描述"><Input value={settings.site_description} onChange={(e) => onChange({ site_description: e.target.value, site_subtitle: e.target.value })} /></Field>
      <Field label="默认语言"><Input value={settings.default_language} onChange={(e) => onChange({ default_language: e.target.value, default_locale: e.target.value })} /></Field>
      <Field label="币种"><Input value={settings.currency} onChange={(e) => onChange({ currency: e.target.value.toUpperCase(), default_currency: e.target.value.toUpperCase() })} /></Field>
      <Field label="时区"><Input value={settings.timezone} onChange={(e) => onChange({ timezone: e.target.value, business_timezone: e.target.value })} /></Field>
      <SaveButton saving={saving} onClick={() => onSave({ site_name: settings.site_name, site_description: settings.site_description, site_subtitle: settings.site_description, default_language: settings.default_language, default_locale: settings.default_language, currency: settings.currency, default_currency: settings.currency, timezone: settings.timezone, business_timezone: settings.timezone })} />
    </Section>
  );
}

function OrderSettings({ settings, saving, onChange, onSave }: SettingsSectionProps) {
  return (
    <Section>
      <Field label="订单支付有效期（分钟）"><Input type="number" min={5} max={1440} value={settings.order_expire_minutes} onChange={(e) => onChange({ order_expire_minutes: Number(e.target.value), order_auto_cancel_minutes: Number(e.target.value) })} /></Field>
      <EditableSwitch title="允许用户取消待支付订单" description="仅影响待支付订单，已支付订单不能由用户取消。" checked={settings.allow_user_cancel_pending_order} onCheckedChange={(checked) => onChange({ allow_user_cancel_pending_order: checked })} />
      <Field label="订单编号前缀"><Input value={settings.order_no_prefix} onChange={(e) => onChange({ order_no_prefix: e.target.value.toUpperCase() })} /></Field>
      <Field label="订单备注提示"><Textarea rows={3} value={settings.default_order_note_hint} onChange={(e) => onChange({ default_order_note_hint: e.target.value })} /></Field>
      <SaveButton saving={saving} onClick={() => onSave({ order_expire_minutes: settings.order_expire_minutes, order_auto_cancel_minutes: settings.order_expire_minutes, allow_user_cancel_pending_order: settings.allow_user_cancel_pending_order, order_no_prefix: settings.order_no_prefix, default_order_note_hint: settings.default_order_note_hint })} />
    </Section>
  );
}

function ContactSettings({ settings, saving, onChange, onSave }: SettingsSectionProps) {
  return (
    <Section>
      <Field label="公开客服邮箱"><Input value={settings.support_email} onChange={(e) => onChange({ support_email: e.target.value })} /></Field>
      <Field label="公开客服电话"><Input value={settings.support_phone} onChange={(e) => onChange({ support_phone: e.target.value })} /></Field>
      <Field label="客服联系方式"><Textarea rows={6} value={settings.support_contact} onChange={(e) => onChange({ support_contact: e.target.value })} /></Field>
      <SaveButton saving={saving} onClick={() => onSave({ support_email: settings.support_email, support_phone: settings.support_phone, support_contact: settings.support_contact })} />
    </Section>
  );
}

function MaintenanceSettings({ settings, saving, onChange, onSave }: SettingsSectionProps) {
  return (
    <Section>
      <EditableSwitch title="开启维护模式" description="开启后普通前台页面显示维护页，后台、健康检查和支付回调保持可用。" checked={settings.maintenance_enabled} onCheckedChange={(checked) => onChange({ maintenance_enabled: checked, site_status: checked ? "maintenance" : "open" })} />
      <Field label="维护提示"><Textarea rows={4} value={settings.maintenance_message} onChange={(e) => onChange({ maintenance_message: e.target.value })} /></Field>
      <StatusRow name="服务端拦截" status="middleware 控制" />
      <SaveButton saving={saving} onClick={() => onSave({ maintenance_enabled: settings.maintenance_enabled, site_status: settings.maintenance_enabled ? "maintenance" : "open", maintenance_message: settings.maintenance_message })} />
    </Section>
  );
}

function AnnouncementSettings({ settings, saving, onChange, onSave }: SettingsSectionProps) {
  return (
    <Section>
      <Field label="全站顶部公告"><Textarea rows={5} value={settings.top_announcement} onChange={(e) => onChange({ top_announcement: e.target.value })} /></Field>
      <Field label="Checkout 购买提醒"><Textarea rows={5} value={settings.checkout_notice} onChange={(e) => onChange({ checkout_notice: e.target.value })} /></Field>
      <p className="text-xs text-slate-500">公告以纯文本方式渲染，不执行 HTML 或脚本。多公告结构已通过 migration 预留，当前顶部公告和购买提醒从系统设置读取。</p>
      <SaveButton saving={saving} onClick={() => onSave({ top_announcement: settings.top_announcement, checkout_notice: settings.checkout_notice })} />
    </Section>
  );
}

function LegalSettings() {
  return (
    <Section>
      <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
        协议与政策使用独立版本管理。已发布版本不会被覆盖，历史订单继续引用原协议版本。
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild><Link href="/admin/settings/legal">管理协议版本</Link></Button>
      </div>
      <StatusRow name="Checkout 协议验证" status="服务端校验" />
      <StatusRow name="订单协议证据" status="已保存版本和哈希" />
    </Section>
  );
}

function SecuritySettings({ settings, logs, saving, onChange, onSave }: SettingsSectionProps & { logs: SiteSettingLog[] }) {
  return (
    <Section>
      <EditableSwitch title="要求邮箱验证" description="保存站点策略，不直接修改 Supabase Auth 项目配置。" checked={settings.require_email_verification} onCheckedChange={(checked) => onChange({ require_email_verification: checked })} />
      <EditableSwitch title="管理员危险操作二次确认" description="用于后台危险操作的二次确认开关。" checked={settings.admin_action_confirm} onCheckedChange={(checked) => onChange({ admin_action_confirm: checked })} />
      <Field label="登录失败提示策略"><NativeSelect value={settings.login_failure_hint_strategy} onChange={(value) => onChange({ login_failure_hint_strategy: value })} options={[{ value: "generic", label: "统一提示" }, { value: "detailed", label: "相对详细提示" }]} /></Field>
      <StatusRow name="Service Role Key" status="不展示、不编辑" />
      <SaveButton saving={saving} onClick={() => onSave({ require_email_verification: settings.require_email_verification, admin_action_confirm: settings.admin_action_confirm, login_failure_hint_strategy: settings.login_failure_hint_strategy })} />
      <div className="rounded-xl border">
        <div className="border-b px-4 py-3 text-sm font-semibold text-slate-950">最近 20 条配置变更</div>
        {logs.length ? <div className="max-h-72 divide-y overflow-y-auto">{logs.map((log) => <div key={log.id} className="px-4 py-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-800">{log.setting_key}</span><span className="text-xs text-slate-500">{new Date(log.updated_at).toLocaleString("zh-CN")}</span></div><div className="mt-1 text-xs text-slate-500">已记录旧值与新值，敏感密钥不进入系统设置。</div></div>)}</div> : <div className="px-4 py-6 text-sm text-slate-500">暂无配置变更记录</div>}
      </div>
    </Section>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-none space-y-4">{children}</div>;
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-[360px] flex-col justify-center rounded-xl border border-dashed bg-slate-50/70 p-8 text-center text-sm text-slate-500">{children}</div>;
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="block space-y-2"><span className="text-xs font-medium text-slate-500">{label}</span>{children}</label>;
}

function NativeSelect({ onChange, options, value }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
}

function EditableSwitch({ checked, description, onCheckedChange, title }: { checked: boolean; description: string; onCheckedChange: (checked: boolean) => void; title: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><div className="text-sm font-medium text-slate-950">{title}</div><div className="mt-1 text-xs text-slate-500">{description}</div></div><Switch checked={checked} onCheckedChange={onCheckedChange} /></div>;
}

function StatusRow({ name, status }: { name: string; status: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border p-4"><span className="text-sm text-slate-700">{name}</span><Badge variant="outline" className="shrink-0 text-[10px]">{status}</Badge></div>;
}

function SaveButton({ onClick, saving }: { saving: boolean; onClick: () => void }) {
  return <Button variant="outline" disabled={saving} onClick={onClick}>{saving ? "保存中..." : "保存设置"}</Button>;
}