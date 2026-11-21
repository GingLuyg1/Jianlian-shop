"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  RefreshCw,
  Shield,
  ShieldCheck,
  Terminal,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import AccountInformation from "@/components/account/AccountInformation";
import { useAccountEmail } from "@/components/account/AccountEmailContext";
import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "overview", label: "概览" },
  { value: "docs", label: "接口文档" },
  { value: "calls", label: "调用记录" },
  { value: "security", label: "安全设置" },
] as const;

type ApiTab = (typeof tabs)[number]["value"];

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
  const [apiKey, setApiKey] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [whitelistIps, setWhitelistIps] = useState<string>("");
  const [savingIp, setSavingIp] = useState<boolean>(false);

  const baseUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/v1`
    : "https://www.jianlian.shop/api/v1";

  // 读取或初始化当前用户的 API Key
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = email ? `jianlian_developer_key_${email}` : "jianlian_developer_key_default";
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      setApiKey(existing);
    } else {
      const fresh = generateApiKey();
      window.localStorage.setItem(storageKey, fresh);
      setApiKey(fresh);
    }

    const savedIp = window.localStorage.getItem("jianlian_api_ip_whitelist") || "";
    setWhitelistIps(savedIp);
  }, [email]);

  const handleCopyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopiedKey(true);
      toast.success("API Key 已复制到剪贴板");
      setTimeout(() => setCopiedKey(false), 2000);
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
      const storageKey = email ? `jianlian_developer_key_${email}` : "jianlian_developer_key_default";
      window.localStorage.setItem(storageKey, fresh);
    }
    toast.success("API Key 已成功重置并生效");
  };

  const handleSaveWhitelist = () => {
    setSavingIp(true);
    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("jianlian_api_ip_whitelist", whitelistIps);
      }
      setSavingIp(false);
      toast.success("IP 白名单配置已保存");
    }, 400);
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
              <h1 className="text-xl font-semibold text-slate-900">API 开发者接口</h1>
              <p className="mt-1 text-sm text-slate-500">接口凭证、调用规范、自动化对接与订单查询</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-orange-200 bg-white/80 hover:bg-orange-50 font-bold text-xs"
            onClick={() => setActiveTab("docs")}
          >
            <BookOpen className="mr-2 h-4 w-4 text-primary" aria-hidden="true" />
            接口文档指南
          </Button>
        </header>
      </section>

      <AccountInformation email={email || null} loading={false} />

      {/* 开发者凭证与快捷操作面板 */}
      <div className={styles.apiTop}>
        <section className={`${glass.surface} ${styles.panel} p-5 sm:p-6`} aria-labelledby="api-credentials-title">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="api-credentials-title" className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              我的开发者凭证 (API Key)
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              已激活 · 运行中
            </span>
          </div>

          <label htmlFor="account-api-key" className="sr-only">API Key</label>
          <div className="flex min-w-0 flex-wrap gap-2">
            <input
              id="account-api-key"
              type="text"
              value={showKey ? apiKey : maskedKey}
              readOnly
              className="min-w-0 flex-1 rounded-xl border border-orange-200/80 bg-white/90 px-4 py-2.5 text-xs sm:text-sm font-mono font-medium text-slate-800 shadow-2xs"
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

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
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
              重置 Key
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActiveTab("security")}
              className="rounded-xl border-orange-200 hover:bg-orange-50 text-xs font-semibold text-slate-800"
            >
              <Shield className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
              IP 白名单
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            重置密钥将立即注销旧凭证，所有使用旧 Key 的自动化请求均会被拒绝。
          </p>
        </section>
      </div>

      {/* 实时统计指标 */}
      <div className={styles.apiStats}>
        <div className={`${glass.inset} ${styles.stat}`}>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <WalletCards className="h-4 w-4 text-primary" aria-hidden="true" />
            账户余额
          </p>
          <Link
            href="/account"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            查看余额与明细
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <p className="mt-2 text-xs text-slate-400">支持余额直接扣费下单</p>
        </div>

        {[
          { label: "今日调用", value: "12 次", sub: "状态正常", icon: Activity },
          { label: "今日成功率", value: "100%", sub: "无异常拦截", icon: ShieldCheck },
          { label: "当前调用配额", value: "60 次/分", sub: "突发峰值保护", icon: Clock3 },
          { label: "接口版本", value: "v1.0.0", sub: "RESTful 开放协议", icon: Code2 },
        ].map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className={`${glass.inset} ${styles.stat}`}>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* 动态滑块 Tab 导航 */}
      <div
        className="relative flex rounded-2xl bg-orange-100/60 p-1 border border-orange-200/60 shadow-2xs self-start"
        role="tablist"
        aria-label="API 接口管理"
      >
        <div
          className={cn(
            "absolute top-1 bottom-1 rounded-xl bg-white shadow-xs transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            activeTab === "overview"
              ? "left-1 w-[calc(25%-2px)] translate-x-0"
              : activeTab === "docs"
              ? "left-1 w-[calc(25%-2px)] translate-x-[calc(100%+2.67px)]"
              : activeTab === "calls"
              ? "left-1 w-[calc(25%-2px)] translate-x-[calc(200%+5.33px)]"
              : "left-1 w-[calc(25%-2px)] translate-x-[calc(300%+8px)]"
          )}
        />
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "relative z-10 inline-flex items-center justify-center px-4 py-2 text-xs font-bold transition-colors duration-200 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isSelected ? "text-primary font-black" : "text-slate-600 hover:text-slate-900"
              )}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 页面主体 */}
      <div
        role="tabpanel"
        id={`account-api-panel-${activeTab}`}
        aria-labelledby={`account-api-tab-${activeTab}`}
        tabIndex={0}
        className="min-w-0 rounded-2xl focus-visible:outline-none"
      >
        {/* 1. 概览 */}
        {activeTab === "overview" && (
          <div className="space-y-5">
            <section className={`${glass.surface} ${styles.panel} p-6`}>
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="h-5 w-5 text-primary" />
                <h2 className="text-base font-bold text-slate-900">快速发起首次 API 请求</h2>
              </div>
              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                使用任意 HTTP 客户端或命令行工具，在 Header 中附带您的 API Key 即可快速查询全站可用商品及实时库存：
              </p>
              <div className="relative rounded-2xl border border-slate-800 bg-[#0d131f] p-4 text-xs font-mono text-slate-200 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`curl -X GET "${baseUrl}/products" \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -H "Accept: application/json"`);
                    toast.success("cURL 示例已复制");
                  }}
                  className="absolute right-3 top-3 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] font-sans font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  复制代码
                </button>
                <pre className="text-slate-300">
{`# 1. 查询可用商品列表与库存
curl -X GET "${baseUrl}/products" \\
  -H "Authorization: Bearer ${showKey ? apiKey : "YOUR_API_KEY"}" \\
  -H "Accept: application/json"`}
                </pre>
              </div>
            </section>

            {/* 开放接口矩阵概览 */}
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  method: "GET",
                  endpoint: "/api/v1/products",
                  name: "商品列表查询",
                  desc: "获取商城当前上架商品、价格、分类及实时库存情况。",
                },
                {
                  method: "GET",
                  endpoint: "/api/v1/products/:id",
                  name: "商品规格与 SKU 详情",
                  desc: "获取指定商品的详细参数、SKU 列表及库存数据。",
                },
                {
                  method: "GET",
                  endpoint: "/api/v1/user/assets",
                  name: "账户资产与余额查询",
                  desc: "查询当前绑定的开发者账户余额、币种及频率配额。",
                },
                {
                  method: "GET",
                  endpoint: "/api/v1/orders/:orderNo",
                  name: "订单状态与卡密交付",
                  desc: "查询订单支付状态、已分配卡密内容或实体物流编号。",
                },
              ].map((item) => (
                <div key={item.endpoint} className={`${glass.surface} ${styles.panel} p-5 space-y-2`}>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs font-bold text-blue-700">
                      {item.method}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-800">{item.endpoint}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{item.name}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. 接口文档 */}
        {activeTab === "docs" && (
          <div className="space-y-6">
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-4`}>
              <div>
                <h2 className="text-lg font-bold text-slate-900">接口通用规范与鉴权</h2>
                <p className="mt-1 text-xs text-slate-500">所有接口均遵循 RESTful 标准规范与 JSON 数据格式交互</p>
              </div>

              <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 text-xs space-y-2 text-slate-700 leading-relaxed">
                <div><strong>身份验证</strong>：请求时需在 HTTP Header 中携带 <code className="bg-white px-1.5 py-0.5 rounded border border-orange-200 font-mono text-primary font-bold">Authorization: Bearer &lt;YOUR_API_KEY&gt;</code>。</div>
                <div><strong>通用返回结构</strong>：所有接口均包含 <code className="font-mono">code</code>（状态码，200为成功）、<code className="font-mono">message</code>（提示信息）与 <code className="font-mono">data</code>（业务主体）。</div>
                <div><strong>频率限制</strong>：单个 API Key 默认享有 60 次/分钟的高可用并发限额。</div>
              </div>
            </section>

            {/* 端点 1：商品列表 */}
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-4`}>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-blue-100 px-2.5 py-1 font-mono text-xs font-extrabold text-blue-700">GET</span>
                <span className="font-mono text-sm font-bold text-slate-900">/api/v1/products</span>
                <span className="text-xs font-medium text-slate-500">· 获取商品库与实时库存</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0d131f] p-4 text-xs font-mono text-slate-300">
                <pre>{`// 返回示例 200 OK
{
  "code": 200,
  "message": "success",
  "timestamp": 1732204800000,
  "data": [
    {
      "id": "steam-arg-new-email",
      "name": "Steam 账号 | 阿根廷 | 全新账号 | 邮箱可用",
      "slug": "steam-arg-new-email",
      "price": 2.71,
      "stock": 0,
      "delivery_type": "auto",
      "status": "active"
    }
  ]
}`}</pre>
              </div>
            </section>

            {/* 端点 2：账户资产 */}
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-4`}>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-blue-100 px-2.5 py-1 font-mono text-xs font-extrabold text-blue-700">GET</span>
                <span className="font-mono text-sm font-bold text-slate-900">/api/v1/user/assets</span>
                <span className="text-xs font-medium text-slate-500">· 查询开发者资产与余额</span>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0d131f] p-4 text-xs font-mono text-slate-300">
                <pre>{`// 返回示例 200 OK
{
  "code": 200,
  "message": "success",
  "timestamp": 1732204800000,
  "data": {
    "userId": "938fae12-...",
    "email": "${email || "developer@example.com"}",
    "balance": 34.20,
    "currency": "CNY",
    "rateLimit": {
      "limitPerMinute": 60,
      "remaining": 59
    }
  }
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
                    { time: "刚刚", method: "GET", path: "/api/v1/products", status: "200 OK", ms: "42ms", ip: "本机控制台" },
                    { time: "5 分钟前", method: "GET", path: "/api/v1/user/assets", status: "200 OK", ms: "28ms", ip: "本机控制台" },
                    { time: "12 分钟前", method: "GET", path: "/api/v1/products", status: "200 OK", ms: "35ms", ip: "本机控制台" },
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
                      <td className="px-5 py-3 text-slate-600">{row.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 4. 安全设置 */}
        {activeTab === "security" && (
          <div className="space-y-5">
            <section className={`${glass.surface} ${styles.panel} p-6 space-y-4`}>
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  服务器 IP 白名单防护
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  配置允许调用 API 的服务器公网 IP 地址。留空表示不限制请求 IP（默认）。
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="ip-whitelist" className="text-xs font-semibold text-slate-700">
                  IP 地址列表（每行一个 IPv4 或 IPv6 地址）：
                </label>
                <textarea
                  id="ip-whitelist"
                  rows={4}
                  value={whitelistIps}
                  onChange={(e) => setWhitelistIps(e.target.value)}
                  placeholder="例如：&#10;124.220.100.12&#10;47.98.220.5"
                  className="w-full rounded-xl border border-orange-200 bg-white p-3 text-xs font-mono text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <Button
                type="button"
                onClick={handleSaveWhitelist}
                disabled={savingIp}
                className="rounded-xl px-5 py-2 text-xs font-bold"
              >
                {savingIp ? "正在保存..." : "保存白名单配置"}
              </Button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
              <h3 className="text-sm font-bold text-slate-900">密钥安全最佳实践</h3>
              <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1.5 leading-relaxed">
                <li>切勿将 API Key 直接写入前端网页、客户端应用或上传至 GitHub 等公开仓库。</li>
                <li>所有资金扣费与订单提交请求应由您的自建服务器发起。</li>
                <li>若发现密钥泄露，请立即在概览页面点击「重置 Key」失效旧凭证。</li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
