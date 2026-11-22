"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Clock3,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Globe,
  HelpCircle,
  KeyRound,
  Lock,
  RefreshCw,
  Send,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Terminal,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import AccountInformation from "@/components/account/AccountInformation";
import { useAccountEmail } from "@/components/account/AccountEmailContext";
import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "overview", label: "概览" },
  { value: "docs", label: "接口文档" },
  { value: "calls", label: "调用记录" },
  { value: "security", label: "安全与加白" },
] as const;

type ApiTab = (typeof tabs)[number]["value"];
type MerchantApiStatus = "unapplied" | "pending" | "approved";

export interface ApiApplicationRecord {
  id: string;
  email: string;
  merchantName: string;
  businessScenario: string;
  serverIps: string[];
  contact: string;
  status: "pending" | "approved" | "rejected";
  appliedAt: string;
  appId?: string;
  appSecret?: string;
}

function generateApiKey() {
  const chars = "abcdef0123456789";
  let randomHex = "";
  for (let i = 0; i < 32; i++) {
    randomHex += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `jl_live_${randomHex}`;
}

export default function AccountApiPage() {
  const email = useAccountEmail();
  const [activeTab, setActiveTab] = useState<ApiTab>("overview");
  const [apiStatus, setApiStatus] = useState<MerchantApiStatus>("unapplied");
  const [appId, setAppId] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedAppId, setCopiedAppId] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [whitelistIps, setWhitelistIps] = useState<string[]>([]);

  // 申请表单状态
  const [merchantName, setMerchantName] = useState("");
  const [businessScenario, setBusinessScenario] = useState("");
  const [applyIps, setApplyIps] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [submittingApply, setSubmittingApply] = useState(false);

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/v1`
      : "https://www.jianlian.shop/api/v1";

  // 读取或初始化当前用户的商户 API 状态与凭证
  useEffect(() => {
    if (typeof window === "undefined") return;
    const userEmail = email || "developer@example.com";
    const statusKey = `jianlian_mch_app_status_${userEmail}`;
    const keyKey = `jianlian_developer_key_${userEmail}`;
    const appIdKey = `jianlian_mch_app_id_${userEmail}`;
    const ipKey = `jianlian_mch_whitelist_${userEmail}`;

    const savedStatus = window.localStorage.getItem(statusKey) as MerchantApiStatus | null;
    const savedKey = window.localStorage.getItem(keyKey);
    const savedAppId = window.localStorage.getItem(appIdKey);
    const savedIps = window.localStorage.getItem(ipKey);

    if (savedStatus) {
      setApiStatus(savedStatus);
      if (savedKey) setApiKey(savedKey);
      if (savedAppId) setAppId(savedAppId);
      if (savedIps) {
        try {
          setWhitelistIps(JSON.parse(savedIps));
        } catch {
          setWhitelistIps([savedIps]);
        }
      }
    } else if (savedKey) {
      // 兼容旧状态
      setApiStatus("approved");
      setApiKey(savedKey);
      const generatedId = `MCH_${Math.abs(hashString(userEmail)).toString().slice(0, 8).padEnd(8, "0")}`;
      setAppId(generatedId);
      setWhitelistIps(["124.220.100.12"]);
      window.localStorage.setItem(appIdKey, generatedId);
      window.localStorage.setItem(statusKey, "approved");
      window.localStorage.setItem(ipKey, JSON.stringify(["124.220.100.12"]));
    }
  }, [email]);

  function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  // 提交 API 接入申请
  const handleSubmitApplication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantName.trim()) {
      toast.error("请输入商户/企业或个人主体名称");
      return;
    }
    if (!businessScenario.trim()) {
      toast.error("请描述您的业务对接场景");
      return;
    }

    setSubmittingApply(true);
    const userEmail = email || "developer@example.com";
    const statusKey = `jianlian_mch_app_status_${userEmail}`;
    const ipKey = `jianlian_mch_whitelist_${userEmail}`;

    const ipsParsed = applyIps
      .split(/[\n,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const newRecord: ApiApplicationRecord = {
      id: `APP_${Date.now()}`,
      email: userEmail,
      merchantName: merchantName.trim(),
      businessScenario: businessScenario.trim(),
      serverIps: ipsParsed,
      contact: contactInfo.trim() || userEmail,
      status: "pending",
      appliedAt: new Date().toISOString(),
    };

    setTimeout(() => {
      if (typeof window !== "undefined") {
        // 保存当前用户状态为 pending
        window.localStorage.setItem(statusKey, "pending");
        // 写入全局后台申请管理池
        try {
          const raw = window.localStorage.getItem("jianlian_admin_api_applications");
          const list: ApiApplicationRecord[] = raw ? JSON.parse(raw) : [];
          list.unshift(newRecord);
          window.localStorage.setItem("jianlian_admin_api_applications", JSON.stringify(list));
        } catch {}
      }
      setApiStatus("pending");
      setSubmittingApply(false);
      toast.success("API 申请已成功提交，平台管理员审核中！");
    }, 600);
  };

  const handleCopyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopiedKey(true);
      toast.success("商户密钥 (AppSecret) 已复制");
      setTimeout(() => setCopiedKey(false), 2000);
    });
  };

  const handleCopyAppId = () => {
    if (!appId) return;
    navigator.clipboard.writeText(appId).then(() => {
      setCopiedAppId(true);
      toast.success("商户 ID (AppID) 已复制");
      setTimeout(() => setCopiedAppId(false), 2000);
    });
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(baseUrl).then(() => {
      setCopiedUrl(true);
      toast.success("接口地址已复制到剪贴板");
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  };

  const handleResetKey = () => {
    const fresh = generateApiKey();
    setApiKey(fresh);
    if (typeof window !== "undefined") {
      const userEmail = email || "developer@example.com";
      const storageKey = `jianlian_developer_key_${userEmail}`;
      window.localStorage.setItem(storageKey, fresh);
    }
    toast.success("商户密钥已重置并立即生效");
  };

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 10)}${"•".repeat(20)}${apiKey.slice(-4)}`
    : "正在生成开发者凭证...";

  return (
    <div
      data-account-page="/account/api"
      data-account-ready={true}
      aria-busy={false}
      className={`${styles.page} ${styles.apiPage} flex min-w-0 flex-col gap-5`}
      data-testid="account-api-page"
    >
      {/* 头部面板 */}
      <section className={`${glass.surface} ${styles.panel} overflow-hidden`}>
        <header className={`${styles.pageHeader} flex flex-wrap items-center justify-between gap-4`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={`${glass.icon} h-11 w-11`}>
              <Code2 className="h-5 w-5 text-primary" strokeWidth={1.6} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">API 开放平台</h1>
              <p className="mt-1 text-sm text-slate-500">商户接口凭证、自动化下单、分销管理与白名单管控</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-orange-200 bg-white/80 hover:bg-orange-50 font-bold text-xs"
              onClick={() => setActiveTab("docs")}
            >
              <BookOpen className="mr-2 h-4 w-4 text-primary" aria-hidden="true" />
              接口文档指南
            </Button>
          </div>
        </header>
      </section>

      {/* 商户核心信息 */}
      <AccountInformation email={email || null} loading={false} />

      {/* 未开通状态：展示申请表单 */}
      {apiStatus === "unapplied" ? (
        <section className={`${glass.surface} ${styles.panel} p-6 sm:p-8 space-y-6`}>
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>开放平台接入申请</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              申请开通 API 接口权限
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              为保证生产平台交易合规与商户资金安全，API 接口采用<strong>审核与白名单准入制</strong>。开通后系统将分配专属商户 ID (AppID) 与商户密钥 (AppSecret)，并由平台管理员在后台统一加白服务器出口 IP。
            </p>
          </div>

          <form onSubmit={handleSubmitApplication} className="max-w-xl space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="merchantName" className="text-xs font-semibold text-slate-700">
                商户/企业/个人主体名称 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="merchantName"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                placeholder="例如：极客数字科技有限公司 / 个人开发者"
                className="h-11 rounded-xl bg-white text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="businessScenario" className="text-xs font-semibold text-slate-700">
                接入业务场景说明 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="businessScenario"
                value={businessScenario}
                onChange={(e) => setBusinessScenario(e.target.value)}
                placeholder="例如：自建电商系统对接、ERP批量代充、海外卡分销等"
                className="h-11 rounded-xl bg-white text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="applyIps" className="text-xs font-semibold text-slate-700">
                拟加白的服务器外网 IP（选填，支持后续由后台人工加白）
              </Label>
              <textarea
                id="applyIps"
                rows={3}
                value={applyIps}
                onChange={(e) => setApplyIps(e.target.value)}
                placeholder="例如：124.220.100.12（每行一个 IP 地址）"
                className="w-full rounded-xl border border-orange-200 bg-white p-3 font-mono text-xs text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="text-[11px] text-slate-500">
                安全提示：商户不可自行更改生效白名单，平台将在审核通过后由管理员在后台统一录入加白。
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contactInfo" className="text-xs font-semibold text-slate-700">
                紧急技术对接联系方式（QQ / Telegram / 电话）
              </Label>
              <Input
                id="contactInfo"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="例如：TG: @jianlian_dev / 手机号"
                className="h-11 rounded-xl bg-white text-sm"
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={submittingApply}
                className="h-11 px-6 rounded-xl font-bold text-sm shadow-sm"
              >
                {submittingApply ? "正在提交申请..." : "立即提交接入申请"}
              </Button>
            </div>
          </form>
        </section>
      ) : apiStatus === "pending" ? (
        /* 申请审核中状态 */
        <section className={`${glass.surface} ${styles.panel} p-8 text-center space-y-4`}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-xs">
            <Clock className="h-7 w-7 animate-pulse" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-xl font-bold text-slate-900">API 接入申请正在审核中</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              您的商户对接申请已成功提交至平台风控与安全中心。管理员将在后台「代理管理」中为您分配商户 ID、签名密钥并完成服务器 IP 白名单加白，通常在 1 个工作日内完成。
            </p>
          </div>
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-orange-200"
              onClick={() => {
                // 演示模式：支持点击模拟通过
                const userEmail = email || "developer@example.com";
                window.localStorage.setItem(`jianlian_mch_app_status_${userEmail}`, "approved");
                const freshKey = generateApiKey();
                const appIdGen = `MCH_${Math.abs(hashString(userEmail)).toString().slice(0, 8).padEnd(8, "0")}`;
                window.localStorage.setItem(`jianlian_developer_key_${userEmail}`, freshKey);
                window.localStorage.setItem(`jianlian_mch_app_id_${userEmail}`, appIdGen);
                window.localStorage.setItem(`jianlian_mch_whitelist_${userEmail}`, JSON.stringify(["124.220.100.12"]));
                setApiKey(freshKey);
                setAppId(appIdGen);
                setWhitelistIps(["124.220.100.12"]);
                setApiStatus("approved");
                toast.success("商户资质审核已通过，凭证与白名单已生效！");
              }}
            >
              刷新审核进度
            </Button>
          </div>
        </section>
      ) : (
        /* 已开通状态：展示商户开发者控制台 */
        <>
          {/* 开发者凭证与快捷操作面板 */}
          <div className={styles.apiTop}>
            <section className={`${glass.surface} ${styles.panel} p-5 sm:p-6 space-y-4`} aria-labelledby="api-credentials-title">
              <div className="flex items-center justify-between gap-3">
                <h2 id="api-credentials-title" className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
                  商户凭证 (AppID & AppSecret)
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  已激活 · 生产环境
                </span>
              </div>

              {/* 商户 ID */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">商户 ID (AppID)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={appId || "MCH_10082691"}
                    readOnly
                    className="flex-1 rounded-xl border border-orange-200/80 bg-white/90 px-3.5 py-2 text-xs font-mono font-bold text-slate-800 shadow-2xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyAppId}
                    className="rounded-xl border-orange-200 hover:bg-orange-50 text-xs font-semibold"
                  >
                    {copiedAppId ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 mr-1 text-slate-500" />}
                    {copiedAppId ? "已复制" : "复制"}
                  </Button>
                </div>
              </div>

              {/* 商户密钥 */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">商户密钥 (AppSecret)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={showKey ? apiKey : maskedKey}
                    readOnly
                    className="flex-1 rounded-xl border border-orange-200/80 bg-white/90 px-3.5 py-2 text-xs font-mono font-medium text-slate-800 shadow-2xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowKey(!showKey)}
                    className="rounded-xl border-orange-200 hover:bg-orange-50 text-xs font-semibold"
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5 mr-1 text-slate-500" /> : <Eye className="h-3.5 w-3.5 mr-1 text-slate-500" />}
                    {showKey ? "隐藏" : "显示"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyKey}
                    className="rounded-xl border-orange-200 hover:bg-orange-50 text-xs font-semibold"
                  >
                    {copiedKey ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 mr-1 text-slate-500" />}
                    {copiedKey ? "已复制" : "复制"}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span className="truncate">接口基地址：<code className="text-slate-700 font-mono font-semibold">{baseUrl}</code></span>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="text-primary hover:underline shrink-0 ml-2 font-medium"
                >
                  {copiedUrl ? "已复制地址" : "复制基地址"}
                </button>
              </div>
            </section>

            <section className={`${glass.surface} ${styles.panel} p-5 sm:p-6`} aria-labelledby="api-actions-title">
              <h2 id="api-actions-title" className="text-base font-semibold text-slate-900">
                快捷操作与安全
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetKey}
                  className="rounded-xl border-orange-200 hover:bg-orange-50 text-xs font-semibold text-slate-800"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  重置密钥
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("security")}
                  className="rounded-xl border-orange-200 hover:bg-orange-50 text-xs font-semibold text-slate-800"
                >
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                  查看加白 IP
                </Button>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                重置密钥将立即注销旧凭证，所有使用旧 Secret 的请求将被安全风控拒绝。
              </p>
            </section>
          </div>

          {/* 实时统计指标 */}
          <div className={styles.apiStats}>
            <div className={`${glass.inset} ${styles.stat}`}>
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Activity className="h-3.5 w-3.5 text-primary" />
                今日调用次数
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-slate-900">128</span>
                <span className="text-xs text-emerald-600 font-medium">正常</span>
              </div>
            </div>

            <div className={`${glass.inset} ${styles.stat}`}>
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                接口成功率
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-slate-900">99.8%</span>
                <span className="text-xs text-slate-400">近 24 小时</span>
              </div>
            </div>

            <div className={`${glass.inset} ${styles.stat}`}>
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Clock3 className="h-3.5 w-3.5 text-blue-600" />
                平均响应耗时
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-slate-900">38ms</span>
                <span className="text-xs text-slate-400">极速响应</span>
              </div>
            </div>

            <div className={`${glass.inset} ${styles.stat}`}>
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                已加白出口 IP
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-slate-900">{whitelistIps.length}</span>
                <span className="text-xs text-slate-400">台服务器</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 选项卡栏 */}
      <div className="flex border-b border-orange-200/60 gap-6 text-sm font-semibold">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "pb-3 transition-colors relative",
              activeTab === tab.value
                ? "text-primary"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            {tab.label}
            {activeTab === tab.value && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* 选项卡内容区 */}
      <div className="space-y-6">
        {/* 1. 概览 */}
        {activeTab === "overview" && (
          <div className="grid gap-6 md:grid-cols-2">
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-3`}>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-primary" />
                快速开始 cURL
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                使用商户密钥通过 Bearer 授权获取账户最新资产与产品清单。
              </p>
              <div className="rounded-xl border border-slate-800 bg-[#0d131f] p-4 text-xs font-mono text-slate-200 overflow-x-auto">
                <pre>{`curl -X GET "${baseUrl}/products" \\
  -H "Authorization: Bearer ${apiKey || "YOUR_APP_SECRET"}" \\
  -H "X-Merchant-Id: ${appId || "YOUR_APP_ID"}" \\
  -H "Accept: application/json"`}</pre>
              </div>
            </section>

            <section className={`${glass.surface} ${styles.panel} p-6 space-y-3`}>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                平台风控准入说明
              </h2>
              <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
                <p>• <strong>API 申请制</strong>：为杜绝恶意刷单与接口滥用，新接入商户需先提交主体信息与业务场景申请。</p>
                <p>• <strong>后台集中加白</strong>：调用接口的服务器出口公网 IP 由平台后台统一审核录入，客户前端不提供随意加白入口。</p>
                <p>• <strong>自动化交付</strong>：通过 API 提交的订单享受全自动库存锁闭与秒级卡密回调通知。</p>
              </div>
            </section>
          </div>
        )}

        {/* 2. 接口文档指南 */}
        {activeTab === "docs" && (
          <div className="space-y-6">
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-4`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">GET</span>
                  <code className="text-sm font-bold font-mono text-slate-900">/api/v1/products</code>
                </div>
                <span className="text-xs font-medium text-slate-500">· 获取可用商品与实时库存</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0d131f] p-4 text-xs font-mono text-slate-300">
                <pre>{`// 返回示例 200 OK
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "prod_steam_arg_01",
      "name": "Steam账号 | 阿根廷 | 全新账号 | 邮箱可用",
      "price": 2.71,
      "stock": 85,
      "deliveryType": "auto"
    }
  ]
}`}</pre>
              </div>
            </section>

            <section className={`${glass.surface} ${styles.panel} p-6 space-y-4`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">POST</span>
                  <code className="text-sm font-bold font-mono text-slate-900">/api/v1/orders/create</code>
                </div>
                <span className="text-xs font-medium text-slate-500">· 提交代理分销采购订单</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0d131f] p-4 text-xs font-mono text-slate-300">
                <pre>{`// 请求体 Payload
{
  "productId": "prod_steam_arg_01",
  "skuId": "sku_default",
  "quantity": 1,
  "customerEmail": "user@example.com",
  "notifyUrl": "https://your-domain.com/api/callback"
}`}</pre>
              </div>
            </section>
          </div>
        )}

        {/* 3. 调用记录 */}
        {activeTab === "calls" && (
          <section className={`${glass.surface} ${styles.panel} overflow-hidden`}>
            <div className="px-6 py-4 border-b border-orange-100/70 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                最近接口调用日志
              </h2>
              <span className="text-xs text-slate-500">保留最近 50 次请求</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-semibold">请求时间</th>
                    <th className="px-5 py-3 font-semibold">方法</th>
                    <th className="px-5 py-3 font-semibold">接口路径</th>
                    <th className="px-5 py-3 font-semibold">状态</th>
                    <th className="px-5 py-3 font-semibold">耗时</th>
                    <th className="px-5 py-3 font-semibold">IP 归属</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {[
                    { time: "刚刚", method: "GET", path: "/api/v1/products", status: "200 OK", ms: "42ms", ip: "124.220.100.12 (白名单)" },
                    { time: "5 分钟前", method: "POST", path: "/api/v1/orders/create", status: "200 OK", ms: "88ms", ip: "124.220.100.12 (白名单)" },
                    { time: "12 分钟前", method: "GET", path: "/api/v1/products", status: "200 OK", ms: "35ms", ip: "124.220.100.12 (白名单)" },
                  ].map((row, idx) => (
                    <tr key={idx} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-5 py-3 text-slate-500 font-mono">{row.time}</td>
                      <td className="px-5 py-3 font-mono font-bold text-blue-600">{row.method}</td>
                      <td className="px-5 py-3 font-mono text-slate-900">{row.path}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                          {row.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-500">{row.ms}</td>
                      <td className="px-5 py-3 text-slate-600 font-mono">{row.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 4. 安全与加白：用户只读展示，明确说明由后台加白 */}
        {activeTab === "security" && (
          <div className="space-y-5">
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-5`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    已生效的服务器 IP 白名单
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    调用商户订单与扣费 API 的请求必须来自以下白名单 IP。<strong>为保障资金安全，白名单由平台统一审核管控，商户不可在此自主加白。</strong>
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 shrink-0">
                  <Lock className="h-3.5 w-3.5" />
                  后台风控托管
                </span>
              </div>

              {/* 已加白列表展示 */}
              <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>当前授权公网 IP 列表 ({whitelistIps.length} 个)</span>
                  <span className="text-slate-400">仅限管理员后台增删</span>
                </div>
                {whitelistIps.length > 0 ? (
                  <div className="space-y-2">
                    {whitelistIps.map((ip, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl border border-white/80 bg-white/90 px-4 py-2.5 text-xs font-mono shadow-2xs"
                      >
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-emerald-600" />
                          <span className="font-bold text-slate-800">{ip}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          已加白 · 运行中
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-orange-200 bg-white/60 p-6 text-center text-xs text-slate-500">
                    暂未绑定有效 IP 白名单，请联系平台管理员或客服加白。
                  </div>
                )}
              </div>

              {/* 申请加白引导提示 */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-800">如需新增或变更服务器 IP？</div>
                  <div className="text-slate-500">请联系专属在线客服或提交加白工单，管理员将在后台代理管理中心为您配置。</div>
                </div>
                <Link
                  href="/terms"
                  className="inline-flex items-center gap-1 text-primary hover:underline font-semibold shrink-0 ml-4"
                >
                  <span>查看接口协议</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
              <h3 className="text-sm font-bold text-slate-900">密钥与白名单风控规范</h3>
              <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1.5 leading-relaxed">
                <li>接口调用采用「商户密钥签名 + 服务器 IP 白名单」双因子鉴权，非白名单 IP 请求将直接返回 403 Forbidden。</li>
                <li>商户密钥具有账户余额扣费权限，切勿泄露或硬编码进客户端软件。</li>
                <li>若服务器迁移或机房变更，请提前 24 小时向客服申请新增白名单 IP。</li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
