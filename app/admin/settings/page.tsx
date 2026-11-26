"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  CreditCard,
  ExternalLink,
  FileText,
  Globe,
  Headphones,
  Loader2,
  Mail,
  Megaphone,
  RotateCcw,
  Send,
  Shield,
  ShieldCheck,
  Store,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { statusLabel } from "@/lib/admin/display-labels";
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
  DEFAULT_SUPPORT_EMAIL,
  DEFAULT_SUPPORT_HOURS,
  DEFAULT_SUPPORT_NOTE,
  DEFAULT_SUPPORT_TELEGRAM,
  SITE_SETTING_DEFINITIONS,
  type AdminSiteSettings,
  type SiteSettingLog,
} from "@/lib/settings/types";
import { cn } from "@/lib/utils";

const groups: readonly {
  id: "basic" | "order" | "contact" | "announcement" | "payments" | "legal" | "maintenance" | "security";
  label: string;
  subtitle: string;
  icon: LucideIcon;
}[] = [
  { id: "basic", label: "站点与展示", subtitle: "品牌名称、库存与原价展示", icon: Store },
  { id: "order", label: "订单与推广", subtitle: "取消权限、备注与分佣比例", icon: ClipboardList },
  { id: "contact", label: "在线客服", subtitle: "全站客服弹窗实时配置", icon: Headphones },
  { id: "announcement", label: "公告设置", subtitle: "结构化轮播与兜底公告", icon: Megaphone },
  { id: "payments", label: "支付与汇率", subtitle: "每日汇率与收款渠道", icon: CreditCard },
  { id: "legal", label: "协议与政策", subtitle: "线上生效协议版本总览", icon: FileText },
  { id: "maintenance", label: "维护模式", subtitle: "全站停服维护开关", icon: Wrench },
  { id: "security", label: "安全与日志", subtitle: "安全基线与配置变更流水", icon: Shield },
] as const;

type GroupId = (typeof groups)[number]["id"];

type SettingsPayload = {
  settings: AdminSiteSettings;
  logs?: SiteSettingLog[];
  needsMigration?: boolean;
  error?: string;
  message?: string;
};

type LegalDocumentSummary = {
  id: string;
  document_type: string;
  version: string;
  title: string;
  status: string;
  published_at: string | null;
};

const LEGAL_TYPE_LABELS: Array<{ type: string; label: string; requiredAtCheckout: boolean }> = [
  { type: "terms_of_service", label: "用户协议", requiredAtCheckout: true },
  { type: "privacy_policy", label: "隐私政策", requiredAtCheckout: false },
  { type: "refund_policy", label: "退款政策", requiredAtCheckout: true },
  { type: "digital_delivery_policy", label: "数字商品交付规则", requiredAtCheckout: true },
  { type: "purchase_notice", label: "商品购买须知", requiredAtCheckout: true },
];

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
        toast.error(payload?.error ?? "保存系统设置失败");
        return;
      }
      const nextSettings = payload?.settings ?? draft;
      setSettings(nextSettings);
      setDraft(nextSettings);
      setLogs(payload?.logs ?? []);
      toast.success(payload?.message ?? "系统设置已保存并同步至前台");
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
      description="仅保留与线上商城实时联动的有效配置项，保存后立即同步前台生效。"
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
            {saving ? "保存中..." : dirty ? "有未保存修改" : "已与线上同步"}
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
            <div className="text-sm font-semibold text-[var(--admin-v2-text-primary)]">配置中心</div>
            <div className="mt-0.5 text-[11px] text-[var(--admin-v2-text-muted)]">全部为当前线上真实生效项</div>
          </div>
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
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

        {/* 右侧设置工作区 */}
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
            {!loading && activeGroup === "announcement" ? (
              <AnnouncementSettings settings={draft} saving={saving} dirty={dirty} onChange={updateDraft} onSave={saveSettings} />
            ) : null}
            {!loading && activeGroup === "payments" ? (
              <div className="w-full max-w-5xl pb-6">
                <RechargeRateSettings />
                <PaymentSettingsPanel />
              </div>
            ) : null}
            {!loading && activeGroup === "legal" ? <LegalSettings /> : null}
            {!loading && activeGroup === "maintenance" ? (
              <MaintenanceSettings settings={draft} saving={saving} dirty={dirty} onChange={updateDraft} onSave={saveSettings} />
            ) : null}
            {!loading && activeGroup === "security" ? <SecuritySettings logs={logs} /> : null}
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
        title="站点品牌与 SEO 标识"
        description="实时同步前台导航栏品牌名、页脚版权以及搜索引擎标题与摘要。"
        badge={<LiveBadge />}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="网站名称" hint="例如 Jianlian，展示在页头、页脚和浏览器标题中">
            <Input value={settings.site_name} onChange={(e) => onChange({ site_name: e.target.value })} />
          </Field>
          <Field label="网站副标题 / SEO 描述" hint="展示在导航副标题及搜索引擎结果摘要中">
            <Input
              value={settings.site_description}
              onChange={(e) => onChange({ site_description: e.target.value, site_subtitle: e.target.value })}
            />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        title="商城前台商品展示开关"
        description="控制商品列表卡片与商品详情页是否展示库存数量和划线原价。"
        badge={<LiveBadge />}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <EditableSwitch
            title="展示商品实时库存"
            description="开启后前台商品卡片与详情页显示当前剩余库存件数。"
            checked={settings.show_stock}
            onCheckedChange={(checked) => onChange({ show_stock: checked })}
          />
          <EditableSwitch
            title="展示商品划线原价"
            description="开启后有配置原价的商品将显示原价对比效果。"
            checked={settings.show_original_price}
            onCheckedChange={(checked) => onChange({ show_original_price: checked })}
          />
        </div>
      </SettingsCard>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-slate-400" />
          当前固定运行环境：简体中文（zh-CN）· 人民币结算（CNY ¥）· 北京时间（UTC+8）
        </span>
      </div>

      <SaveBar
        saving={saving}
        dirty={dirty}
        onClick={() =>
          onSave({
            site_name: settings.site_name,
            site_description: settings.site_description,
            site_subtitle: settings.site_description,
            show_stock: settings.show_stock,
            show_original_price: settings.show_original_price,
          })
        }
      />
    </Section>
  );
}

function OrderSettings({ settings, saving, dirty, onChange, onSave }: SettingsSectionProps) {
  const commissionPercent = Number((Number(settings.promotion_commission_rate ?? 0) * 100).toFixed(2));

  return (
    <Section>
      <SettingsCard
        title="订单下单与取消规则"
        description="实时控制用户端待支付订单取消权限与结算页备注输入框提示（订单号前缀 JL 与支付超时由支付通道统一控制）。"
        badge={<LiveBadge />}
      >
        <EditableSwitch
          title="允许用户自行取消待支付订单"
          description="仅影响尚未支付的订单；已支付或已发货订单不能由用户取消。"
          checked={settings.allow_user_cancel_pending_order}
          onCheckedChange={(checked) => onChange({ allow_user_cancel_pending_order: checked })}
        />
        <Field label="结算页订单备注提示" hint="作为 /checkout 页面订单备注输入框的占位提示语">
          <Textarea
            rows={3}
            value={settings.default_order_note_hint}
            onChange={(e) => onChange({ default_order_note_hint: e.target.value })}
          />
        </Field>
      </SettingsCard>

      <SettingsCard
        title="推广返佣规则"
        description="实时控制用户中心「推广赚钱」页面开关、新成交订单返佣比例与最低提现门槛。"
        badge={<LiveBadge />}
      >
        <EditableSwitch
          title="开启推广返佣功能"
          description="关闭后用户推广页将暂停新返佣结算，已有余额不受影响。"
          checked={settings.promotion_enabled}
          onCheckedChange={(checked) => onChange({ promotion_enabled: checked })}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="默认推广返佣比例（%）" hint="例如填写 3 表示 3% 返佣，支持 0 ~ 100">
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={Number.isFinite(commissionPercent) ? commissionPercent : 0}
                onChange={(e) => {
                  const pct = Number(e.target.value);
                  const clamped = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
                  onChange({ promotion_commission_rate: Number((clamped / 100).toFixed(4)) });
                }}
                className="pr-8"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
            </div>
          </Field>
          <Field label="佣金最低提现金额（¥）" hint="达到此金额后推广用户才可发起提现申请">
            <Input
              type="number"
              min={0}
              step={1}
              value={settings.promotion_min_withdraw_amount}
              onChange={(e) => onChange({ promotion_min_withdraw_amount: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
        </div>
      </SettingsCard>

      <SaveBar
        saving={saving}
        dirty={dirty}
        onClick={() =>
          onSave({
            allow_user_cancel_pending_order: settings.allow_user_cancel_pending_order,
            default_order_note_hint: settings.default_order_note_hint,
            promotion_enabled: settings.promotion_enabled,
            promotion_commission_rate: settings.promotion_commission_rate,
            promotion_min_withdraw_amount: settings.promotion_min_withdraw_amount,
          })
        }
      />
    </Section>
  );
}

function ContactSettings({ settings, saving, dirty, onChange, onSave }: SettingsSectionProps) {
  const previewTg = (settings.support_telegram || "").trim() || DEFAULT_SUPPORT_TELEGRAM;
  const previewEmail = (settings.support_email || "").trim() || DEFAULT_SUPPORT_EMAIL;
  const previewHours = (settings.support_hours || "").trim() || DEFAULT_SUPPORT_HOURS;
  const previewNote = (settings.support_note || "").trim() || DEFAULT_SUPPORT_NOTE;

  return (
    <Section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <SettingsCard
          title="全站在线客服弹窗配置"
          description="保存后实时同步到商城侧边栏、页脚及移动端右下角「在线客服」弹窗。"
          badge={<LiveBadge />}
        >
          <Field label="Telegram 客服链接" hint="必须以 https:// 开头，例如 https://t.me/Ezeasl">
            <Input
              placeholder="https://t.me/Ezeasl"
              value={settings.support_telegram}
              onChange={(e) => onChange({ support_telegram: e.target.value })}
            />
          </Field>
          <Field label="客服邮箱" hint="用户在客服弹窗中可一键复制该邮箱">
            <Input
              placeholder="Yac0000189@gmail.com"
              value={settings.support_email}
              onChange={(e) => onChange({ support_email: e.target.value })}
            />
          </Field>
          <Field label="上班时间说明" hint="例如 12:00 - 24:00 (GMT+8)">
            <Input
              placeholder="12:00 - 24:00 (GMT+8)"
              value={settings.support_hours}
              onChange={(e) => onChange({ support_hours: e.target.value })}
            />
          </Field>
          <Field label="弹窗底部留言说明" hint="展示在客服联系方式列表最下方">
            <Textarea
              rows={2}
              placeholder="有问题均可留言，客服会在24小时内处理并留言。"
              value={settings.support_note}
              onChange={(e) => onChange({ support_note: e.target.value })}
            />
          </Field>
        </SettingsCard>

        {/* 实时弹窗效果预览 */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">前台弹窗实时预览</span>
            <Badge variant="outline" className="bg-white text-[10px] text-slate-500">
              所见即所得
            </Badge>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center gap-2.5 pb-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <Headphones className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">客服联系方式</div>
                <div className="text-[11px] text-slate-500">请选择以下方式联系我们</div>
              </div>
            </div>
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs">
              <div className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Send className="h-4 w-4 shrink-0 text-orange-500" />
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">Telegram</div>
                    <div className="truncate text-[11px] text-slate-500">{previewTg}</div>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md border bg-white px-2 py-1 text-[10px] text-slate-600">
                  <ExternalLink className="h-3 w-3" /> 打开
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-orange-500" />
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">Email</div>
                    <div className="truncate text-[11px] text-slate-500">{previewEmail}</div>
                  </div>
                </div>
                <span className="shrink-0 rounded-md border bg-white px-2 py-1 text-[10px] text-slate-600">复制</span>
              </div>
              <div className="flex items-start gap-2 py-2.5">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                <div>
                  <div className="font-medium text-slate-900">上班时间</div>
                  <div className="text-[11px] text-slate-500">{previewHours}</div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-500">{previewNote}</p>
          </div>
        </div>
      </div>

      <SaveBar
        saving={saving}
        dirty={dirty}
        onClick={() =>
          onSave({
            support_telegram: settings.support_telegram,
            support_email: settings.support_email,
            support_hours: settings.support_hours,
            support_note: settings.support_note,
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
        title="兜底全站顶部公告"
        description="当上方结构化公告全部停用或过期时，前台顶部横幅自动回退展示此段纯文本公告（不执行 HTML / 脚本）。"
        badge={<LiveBadge />}
      >
        <Field label="兜底顶部公告内容">
          <Textarea
            rows={3}
            value={settings.top_announcement}
            onChange={(e) => onChange({ top_announcement: e.target.value })}
          />
        </Field>
      </SettingsCard>

      <SaveBar
        saving={saving}
        dirty={dirty}
        onClick={() => onSave({ top_announcement: settings.top_announcement })}
      />
    </Section>
  );
}

function LegalSettings() {
  const [publishedDocs, setPublishedDocs] = useState<LegalDocumentSummary[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/admin/legal?status=published", { cache: "no-store" })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as { documents?: LegalDocumentSummary[] } | null;
        if (mounted && res.ok) setPublishedDocs(payload?.documents ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoadingDocs(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const latestByType = useMemo(() => {
    const map = new Map<string, LegalDocumentSummary>();
    for (const doc of publishedDocs) {
      if (!map.has(doc.document_type)) map.set(doc.document_type, doc);
    }
    return map;
  }, [publishedDocs]);

  return (
    <Section>
      <SettingsCard
        title="线上生效协议总览"
        description="协议与政策采用不可变版本化管理；历史订单永久绑定下单时的协议版本号与内容哈希。"
        badge={<LiveBadge />}
      >
        {loadingDocs ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80">
            {LEGAL_TYPE_LABELS.map((item) => {
              const doc = latestByType.get(item.type);
              return (
                <div key={item.type} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{item.label}</span>
                    {item.requiredAtCheckout ? (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] text-blue-700">
                        下单必签
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {doc ? (
                      <>
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 font-mono text-[11px] text-emerald-700">
                          v{doc.version}
                        </Badge>
                        <span className="tabular-nums text-slate-400">
                          {doc.published_at
                            ? new Date(doc.published_at).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
                            : "已发布"}
                        </span>
                      </>
                    ) : (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[11px] text-amber-700">
                        待发布
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs text-slate-500">新增草稿、发布新版本或归档旧协议请进入独立版本管理页。</span>
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/admin/settings/legal">
              管理协议版本
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </SettingsCard>
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
            开启维护模式后约 15 秒内拦截所有普通用户前台访问并跳转至维护提示页；管理后台、健康检查和第三方支付回调保持正常可用。
          </p>
        </div>
      </div>

      <SettingsCard
        title="站点运行状态控制"
        description="由边缘 middleware 实时读取控制，适合升级维护或紧急止损时开启。"
        badge={<LiveBadge />}
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

function SecuritySettings({ logs }: { logs: SiteSettingLog[] }) {
  return (
    <Section>
      <SettingsCard
        title="站点安全运行基线"
        description="所有敏感凭据与权限策略均在服务端强制实施，不通过前端开关降级。"
        badge={
          <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700">
            <ShieldCheck className="h-3 w-3" />
            服务端强制保护
          </Badge>
        }
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          <StatusRow name="Service Role Key" status="不展示、不编辑" />
          <StatusRow name="支付网关密钥与签名秘钥" status="仅服务端环境变量读取" />
          <StatusRow name="高危后台接口鉴权" status="超级管理员强校验" />
          <StatusRow name="系统设置写操作审计" status="自动记录旧值与新值" />
        </div>
      </SettingsCard>

      <SettingsCard
        title="最近 20 条配置变更流水"
        description="每次保存系统设置时自动留档变更前后摘要（北京时间）。"
      >
        {logs.length ? (
          <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200/80">
            {logs.map((log) => {
              const def = SITE_SETTING_DEFINITIONS[log.setting_key as keyof AdminSiteSettings];
              return (
                <div key={log.id} className="space-y-1 px-3.5 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0" title={log.setting_key}>
                      <span className="font-medium text-slate-900">{def?.description ?? statusLabel(log.setting_key)}</span>
                    </div>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {new Date(log.updated_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="max-w-[260px] truncate rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                      {formatLogValue(log.old_value)}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="max-w-[260px] truncate rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700">
                      {formatLogValue(log.new_value)}
                    </span>
                  </div>
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

function formatLogValue(raw: unknown): string {
  const val = raw && typeof raw === "object" && "value" in raw ? (raw as { value?: unknown }).value : raw;
  if (val === null || val === undefined || val === "") return "（空）";
  if (val === true) return "开启";
  if (val === false) return "关闭";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
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

function LiveBadge() {
  return (
    <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-[11px] font-medium text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />
      实时生效
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
        {dirty ? "检测到未保存更改，点击保存后立即同步前台并写入审计日志。" : "当前分组配置与线上保持一致。"}
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
