"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Globe,
  Headphones,
  Info,
  Loader2,
  Megaphone,
  RotateCcw,
  Shield,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import PaymentSettingsPanel from "@/components/admin/payments/PaymentSettingsPanel";
import RechargeRateSettings from "@/components/admin/payments/RechargeRateSettings";
import AdminAnnouncementsManager from "@/components/admin/settings/AdminAnnouncementsManager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_ADMIN_SETTINGS,
  SITE_SETTING_DEFINITIONS,
  type AdminSiteSettings,
  type SiteSettingLog,
} from "@/lib/settings/types";
import { cn } from "@/lib/utils";

const groups: readonly {
  id: "basic" | "order" | "contact" | "maintenance" | "announcement" | "legal" | "payments" | "security";
  label: string;
  subtitle: string;
  icon: LucideIcon;
}[] = [
  { id: "basic", label: "基础信息", subtitle: "站点名称、SEO 描述", icon: Globe },
  { id: "order", label: "订单设置", subtitle: "取消权限与备注提示", icon: ClipboardList },
  { id: "contact", label: "联系方式", subtitle: "客服卡片与公开邮箱", icon: Headphones },
  { id: "maintenance", label: "维护模式", subtitle: "全站停服维护开关", icon: Wrench },
  { id: "announcement", label: "公告设置", subtitle: "轮播公告与兜底文案", icon: Megaphone },
  { id: "legal", label: "协议与政策", subtitle: "版本化协议与下单确认", icon: FileText },
  { id: "payments", label: "支付设置", subtitle: "每日汇率与收款渠道", icon: CreditCard },
  { id: "security", label: "安全设置", subtitle: "策略留档与变更记录", icon: Shield },
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
  const activeGroupMeta = useMemo(() => groups.find((group) => group.id === activeGroup) ?? groups[0], [activeGroup]);

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
        if (payload?.needsMigration) setMessage("系统设置数据表尚未初始化，请先执行 settings 数据库结构升级。");
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

  function resetDraft() {
    setDraft(settings);
    toast.info("已还原为上次保存的配置");
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
        toast.error(error);
        return;
      }
      const nextSettings = payload?.settings ?? draft;
      setSettings(nextSettings);
      setDraft(nextSettings);
      setLogs(payload?.logs ?? []);
      toast.success(payload?.message ?? "系统设置已保存");
    } catch {
      toast.error("保存系统设置失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  const ActiveIcon = activeGroupMeta.icon;

  return (
    <AdminPageShell
      variant="v2"
      title="系统设置"
      description="集中管理网站公开配置、订单规则、公告、协议、每日汇率、收款渠道与维护模式。"
      actions={
        <div className="flex items-center gap-2">
          {settings.maintenance_enabled ? (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
              维护模式已开启
            </Badge>
          ) : null}
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={resetDraft} disabled={saving} className="gap-1.5 text-slate-600">
              <RotateCcw className="h-3.5 w-3.5" />
              撤销修改
            </Button>
          ) : null}
          <Badge
            variant={dirty ? "secondary" : "outline"}
            className={cn(
              dirty ? "border-blue-200 bg-blue-50 text-blue-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
            )}
          >
            {saving ? "保存中..." : dirty ? "有未保存修改" : "配置已同步"}
          </Badge>
        </div>
      }
    >
      {message ? (
        <div
          className="mb-3 shrink-0 rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-warning-foreground)]/20 bg-[var(--admin-v2-warning-background)] px-4 py-3 text-sm text-[var(--admin-v2-warning-foreground)]"
          role="status"
        >
          {message}
        </div>
      ) : null}

      <div className="grid h-full min-h-0 w-full flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[248px_minmax(0,1fr)]">
        {/* 左侧分组导航 */}
        <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)] shadow-none">
          <div className="shrink-0 border-b border-[var(--admin-v2-border)] px-4 py-3">
            <div className="text-sm font-semibold text-[var(--admin-v2-text-primary)]">设置分组</div>
            <div className="mt-0.5 text-[11px] text-[var(--admin-v2-text-muted)]">已标注各项前台生效状态</div>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
            {groups.map((group) => {
              const Icon = group.icon;
              const active = activeGroup === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => switchGroup(group.id)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors",
                    active
                      ? "bg-[var(--admin-v2-selected)] text-[var(--admin-v2-primary)]"
                      : "text-[var(--admin-v2-text-secondary)] hover:bg-[var(--admin-v2-surface-muted)] hover:text-[var(--admin-v2-text-primary)]"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={cn(
                      "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs transition-colors",
                      active
                        ? "border-blue-200/80 bg-white text-blue-600"
                        : "border-slate-200/70 bg-slate-50 text-slate-500 group-hover:bg-white"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className={cn("truncate text-sm", active ? "font-semibold" : "font-medium")}>
                        {group.label}
                      </span>
                      {group.id === "maintenance" && settings.maintenance_enabled ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" title="维护模式已开启" />
                      ) : null}
                    </div>
                    <div className="truncate text-[11px] text-slate-400">{group.subtitle}</div>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* 右侧设置内容 */}
        <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)] shadow-none">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--admin-v2-border)] px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50 text-slate-700">
                <ActiveIcon className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-[var(--admin-v2-text-primary)]">{activeGroupMeta.label}</h2>
                <p className="text-xs text-[var(--admin-v2-text-muted)]">{activeGroupMeta.subtitle}</p>
              </div>
            </div>
          </div>

          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {loading ? <AdminTableSkeleton rows={6} className="p-0" /> : null}
            {!loading && activeGroup === "basic" ? (
              <BasicSettings settings={draft} saving={saving} dirty={dirty} onChange={updateDraft} onSave={saveSettings} />
            ) : null}
            {!loading && activeGroup === "order" ? (
              <OrderSettings settings={draft} saving={saving} dirty={dirty} onChange={updateDraft} onSave={saveSettings} />
            ) : null}
            {!loading && activeGroup === "contact" ? (
              <ContactSettings settings={draft} saving={saving} dirty={dirty} onChange={updateDraft} onSave={saveSettings} />
            ) : null}
            {!loading && activeGroup === "maintenance" ? (
              <MaintenanceSettings settings={draft} saving={saving} dirty={dirty} onChange={updateDraft} onSave={saveSettings} />
            ) : null}
            {!loading && activeGroup === "announcement" ? (
              <AnnouncementSettings settings={draft} saving={saving} dirty={dirty} onChange={updateDraft} onSave={saveSettings} />
            ) : null}
            {!loading && activeGroup === "legal" ? <LegalSettings /> : null}
            {!loading && activeGroup === "payments" ? (
              <>
                <RechargeRateSettings />
                <PaymentSettingsPanel />
              </>
            ) : null}
            {!loading && activeGroup === "security" ? (
              <SecuritySettings settings={draft} logs={logs} saving={saving} dirty={dirty} onChange={updateDraft} onSave={saveSettings} />
            ) : null}
          </div>
        </section>
      </div>
    </AdminPageShell>
  );
}

type SettingsSectionProps = {
  settings: AdminSiteSettings;
  saving: boolean;
  dirty: boolean;
  onChange: (patch: Partial<AdminSiteSettings>) => void;
  onSave: (settings: Partial<AdminSiteSettings>) => void;
};

function BasicSettings({ settings, saving, dirty, onChange, onSave }: SettingsSectionProps) {
  return (
    <Section>
      <SettingsCard
        title="站点品牌与 SEO 信息"
        description="修改后将同步影响前台页头标题、页脚品牌名以及搜索引擎元数据。"
        badge={<EffectBadge active />}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="网站名称" hint="展示在前台导航栏、浏览器标题和商品页 SEO 中">
            <Input value={settings.site_name} onChange={(e) => onChange({ site_name: e.target.value })} />
          </Field>
          <Field label="网站描述" hint="展示在网站副标题与搜索引擎摘要中">
            <Input
              value={settings.site_description}
              onChange={(e) => onChange({ site_description: e.target.value, site_subtitle: e.target.value })}
            />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        title="区域与基础标识"
        description="当前商城默认使用简体中文、人民币（CNY）与北京时间（Asia/Shanghai）结算展示，修改此处仅作基础标识存档，不会自动切换全站多语言或汇率。"
        badge={<EffectBadge active={false} label="基础标识 / 兼容存档" />}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="默认语言">
            <Input
              value={settings.default_language}
              onChange={(e) => onChange({ default_language: e.target.value, default_locale: e.target.value })}
            />
          </Field>
          <Field label="默认币种">
            <Input
              value={settings.currency}
              onChange={(e) =>
                onChange({ currency: e.target.value.toUpperCase(), default_currency: e.target.value.toUpperCase() })
              }
            />
          </Field>
          <Field label="业务时区">
            <Input
              value={settings.timezone}
              onChange={(e) => onChange({ timezone: e.target.value, business_timezone: e.target.value })}
            />
          </Field>
        </div>
      </SettingsCard>

      <SaveBar
        saving={saving}
        dirty={dirty}
        onClick={() =>
          onSave({
            site_name: settings.site_name,
            site_description: settings.site_description,
            site_subtitle: settings.site_description,
            default_language: settings.default_language,
            default_locale: settings.default_language,
            currency: settings.currency,
            default_currency: settings.currency,
            timezone: settings.timezone,
            business_timezone: settings.timezone,
          })
        }
      />
    </Section>
  );
}

function OrderSettings({ settings, saving, dirty, onChange, onSave }: SettingsSectionProps) {
  return (
    <Section>
      <SettingsCard
        title="前台下单与取消规则"
        description="直接控制用户端待支付订单取消权限与结算页备注输入框提示。"
        badge={<EffectBadge active />}
      >
        <EditableSwitch
          title="允许用户取消待支付订单"
          description="仅影响尚未支付的订单；已支付或已发货订单不可由用户自行取消。"
          checked={settings.allow_user_cancel_pending_order}
          onCheckedChange={(checked) => onChange({ allow_user_cancel_pending_order: checked })}
        />
        <Field label="结算页订单备注提示" hint="显示在用户下单结算页的备注框提示中">
          <Textarea
            rows={3}
            value={settings.default_order_note_hint}
            onChange={(e) => onChange({ default_order_note_hint: e.target.value })}
          />
        </Field>
      </SettingsCard>

      <SettingsCard
        title="历史兼容参数（当前由数据库规则固定）"
        description="订单号前缀（JL）与支付会话超时目前由数据库事务与支付通道超时参数直接控制，以下字段保留用于历史配置兼容。"
        badge={<EffectBadge active={false} label="历史兼容项" />}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="订单支付有效期（分钟）" hint="范围 5 - 1440 分钟（实际支付超时以各支付渠道配置为准）">
            <Input
              type="number"
              min={5}
              max={1440}
              value={settings.order_expire_minutes}
              onChange={(e) =>
                onChange({
                  order_expire_minutes: Number(e.target.value),
                  order_auto_cancel_minutes: Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="订单编号前缀" hint="当前数据库下单函数默认固定为 JL">
            <Input
              value={settings.order_no_prefix}
              onChange={(e) => onChange({ order_no_prefix: e.target.value.toUpperCase() })}
            />
          </Field>
        </div>
      </SettingsCard>

      <SaveBar
        saving={saving}
        dirty={dirty}
        onClick={() =>
          onSave({
            order_expire_minutes: settings.order_expire_minutes,
            order_auto_cancel_minutes: settings.order_expire_minutes,
            allow_user_cancel_pending_order: settings.allow_user_cancel_pending_order,
            order_no_prefix: settings.order_no_prefix,
            default_order_note_hint: settings.default_order_note_hint,
          })
        }
      />
    </Section>
  );
}

function ContactSettings({ settings, saving, dirty, onChange, onSave }: SettingsSectionProps) {
  return (
    <Section>
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs leading-5 text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div>
          <span className="font-semibold">前台客服弹窗说明：</span>
          目前全站右下角与导航栏“在线客服”弹窗中展示的 Telegram（<span className="font-mono">https://t.me/Ezeasl</span>）和邮箱（
          <span className="font-mono">Yac0000189@gmail.com</span>）固定写在商城布局模板中；下方配置主要供页面内客服卡片与公开信息读取。
        </div>
      </div>

      <SettingsCard
        title="公开客服信息"
        description="用于商品/帮助页客服卡片展示与站点公开联系信息。"
        badge={<EffectBadge active />}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="公开客服邮箱" hint="供站点公开元信息与页脚读取">
            <Input
              placeholder="例如 Yac0000189@gmail.com"
              value={settings.support_email}
              onChange={(e) => onChange({ support_email: e.target.value })}
            />
          </Field>
          <Field label="公开客服电话（可选）" hint="未提供电话客服时建议留空">
            <Input
              placeholder="留空表示不展示电话"
              value={settings.support_phone}
              onChange={(e) => onChange({ support_phone: e.target.value })}
            />
          </Field>
        </div>
        <Field label="客服联系方式卡片文案" hint="每行展示一条联系渠道（支持 Telegram、邮箱、工作时间等）">
          <Textarea rows={6} value={settings.support_contact} onChange={(e) => onChange({ support_contact: e.target.value })} />
        </Field>
      </SettingsCard>

      <SaveBar
        saving={saving}
        dirty={dirty}
        onClick={() =>
          onSave({
            support_email: settings.support_email,
            support_phone: settings.support_phone,
            support_contact: settings.support_contact,
          })
        }
      />
    </Section>
  );
}

function MaintenanceSettings({ settings, saving, dirty, onChange, onSave }: SettingsSectionProps) {
  return (
    <Section>
      <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <div className="text-sm font-semibold">高影响全局开关（实时生效）</div>
          <p className="mt-1 text-xs leading-5 text-amber-900/90">
            开启维护模式后，约 15 秒内将拦截所有普通用户前台访问并跳转至维护提示页；管理后台、健康检查和第三方支付回调接口保持正常可用。
          </p>
        </div>
      </div>

      <SettingsCard
        title="站点运行状态控制"
        description="由网关 middleware 实时读取控制，适合升级维护或紧急止损时开启。"
        badge={<EffectBadge active />}
      >
        <EditableSwitch
          title="开启全站维护模式"
          description="开启后普通前台页面显示下方维护提示，关闭后立即恢复正常营业。"
          checked={settings.maintenance_enabled}
          onCheckedChange={(checked) => onChange({ maintenance_enabled: checked, site_status: checked ? "maintenance" : "open" })}
        />
        <Field label="维护页提示文案" hint="用户访问被拦截时将在 /maintenance 页面看到此段说明">
          <Textarea
            rows={4}
            value={settings.maintenance_message}
            onChange={(e) => onChange({ maintenance_message: e.target.value })}
          />
        </Field>
        <StatusRow name="服务端拦截机制" status="middleware 实时控制（15s 缓存）" />
      </SettingsCard>

      <SaveBar
        saving={saving}
        dirty={dirty}
        onClick={() =>
          onSave({
            maintenance_enabled: settings.maintenance_enabled,
            site_status: settings.maintenance_enabled ? "maintenance" : "open",
            maintenance_message: settings.maintenance_message,
          })
        }
      />
    </Section>
  );
}

function AnnouncementSettings({ settings, saving, dirty, onChange, onSave }: SettingsSectionProps) {
  return (
    <Section>
      <AdminAnnouncementsManager embedded />

      <SettingsCard
        title="兜底文本公告"
        description="仅当上方结构化公告全部停用或过期时，前台顶部横幅才会回退展示此处的兜底纯文本公告（不执行 HTML / 脚本）。"
        badge={<EffectBadge active />}
      >
        <Field label="兜底全站顶部公告">
          <Textarea
            rows={3}
            value={settings.top_announcement}
            onChange={(e) => onChange({ top_announcement: e.target.value })}
          />
        </Field>
        <Field
          label="Checkout 购买提醒（兼容留档）"
          hint="当前结算页协议确认已升级为“协议与政策”中的版本化《商品购买须知》，此处保留用于兼容"
        >
          <Textarea
            rows={3}
            value={settings.checkout_notice}
            onChange={(e) => onChange({ checkout_notice: e.target.value })}
          />
        </Field>
      </SettingsCard>

      <SaveBar
        saving={saving}
        dirty={dirty}
        onClick={() => onSave({ top_announcement: settings.top_announcement, checkout_notice: settings.checkout_notice })}
      />
    </Section>
  );
}

function LegalSettings() {
  return (
    <Section>
      <SettingsCard
        title="版本化协议与政策管理"
        description="管理《用户协议》《隐私政策》《退款政策》《数字商品交付规则》《商品购买须知》。已发布版本不可覆盖，历史订单永久关联下单时的协议版本与哈希证据。"
        badge={<EffectBadge active />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusRow name="Checkout 协议强校验" status="服务端校验生效中" />
          <StatusRow name="订单协议存证" status="自动保存版本号与哈希" />
        </div>
        <div className="pt-1">
          <Button asChild className="gap-1.5">
            <Link href="/admin/settings/legal">
              进入协议版本管理
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </SettingsCard>
    </Section>
  );
}

function SecuritySettings({
  settings,
  logs,
  saving,
  dirty,
  onChange,
  onSave,
}: SettingsSectionProps & { logs: SiteSettingLog[] }) {
  return (
    <Section>
      <SettingsCard
        title="站点安全策略留档"
        description="记录后台运维策略意图，不会直接篡改 Supabase Auth 控制台或服务器环境变量；敏感密钥仅保存在服务端环境变量中。"
        badge={<EffectBadge active={false} label="策略留档项" />}
      >
        <EditableSwitch
          title="要求邮箱验证（策略留档）"
          description="仅保存站点策略记录；实际注册邮箱验证开关请在 Supabase Auth 控制台配置。"
          checked={settings.require_email_verification}
          onCheckedChange={(checked) => onChange({ require_email_verification: checked })}
        />
        <EditableSwitch
          title="管理员危险操作二次确认"
          description="用于记录后台高危操作的二次确认合规策略。"
          checked={settings.admin_action_confirm}
          onCheckedChange={(checked) => onChange({ admin_action_confirm: checked })}
        />
        <Field label="登录失败提示策略">
          <NativeSelect
            value={settings.login_failure_hint_strategy}
            onChange={(value) => onChange({ login_failure_hint_strategy: value })}
            options={[
              { value: "generic", label: "统一模糊提示（推荐，防账号枚举）" },
              { value: "detailed", label: "相对详细提示" },
            ]}
          />
        </Field>
        <StatusRow name="Service Role Key" status="不展示、不编辑" />
      </SettingsCard>

      <SaveBar
        saving={saving}
        dirty={dirty}
        onClick={() =>
          onSave({
            require_email_verification: settings.require_email_verification,
            admin_action_confirm: settings.admin_action_confirm,
            login_failure_hint_strategy: settings.login_failure_hint_strategy,
          })
        }
      />

      <SettingsCard
        title="最近 20 条配置变更记录"
        description="每次在系统设置中保存修改都会自动记录审计流水（敏感密钥永不入库）。"
      >
        {logs.length ? (
          <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200/80">
            {logs.map((log) => {
              const def = SITE_SETTING_DEFINITIONS[log.setting_key as keyof AdminSiteSettings];
              return (
                <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900">{def?.description ?? log.setting_key}</span>
                    <span className="ml-2 font-mono text-[11px] text-slate-400">{log.setting_key}</span>
                  </div>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {new Date(log.updated_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
            暂无配置变更记录
          </div>
        )}
      </SettingsCard>
    </Section>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-4xl space-y-4 pb-6">{children}</div>;
}

function SettingsCard({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p> : null}
        </div>
        {badge}
      </div>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </div>
  );
}

function EffectBadge({ active, label }: { active: boolean; label?: string }) {
  return active ? (
    <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-[11px] font-medium text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />
      {label ?? "前台生效中"}
    </Badge>
  ) : (
    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
      {label ?? "历史兼容项"}
    </Badge>
  );
}

function Field({ children, label, hint }: { children: ReactNode; label: string; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-slate-400">{hint}</span> : null}
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
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5">
      <div>
        <div className="text-sm font-medium text-slate-950">{title}</div>
        <div className="mt-0.5 text-xs text-slate-500">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function StatusRow({ name, status }: { name: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-3.5 py-3">
      <span className="text-xs font-medium text-slate-700">{name}</span>
      <Badge variant="outline" className="shrink-0 bg-white text-[11px] font-normal text-slate-600">
        {status}
      </Badge>
    </div>
  );
}

function SaveBar({ onClick, saving, dirty }: { saving: boolean; dirty: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3">
      <span className="text-xs text-slate-500">
        {dirty ? "检测到未保存更改，点击右侧按钮立即生效并写入审计日志。" : "当前分组配置与服务端保持一致。"}
      </span>
      <Button disabled={saving} onClick={onClick} size="sm">
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            保存中...
          </>
        ) : (
          "保存设置"
        )}
      </Button>
    </div>
  );
}
