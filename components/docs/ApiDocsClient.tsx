"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  KeyRound,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_URL = "https://www.jianlian.shop";

const TOC_ITEMS = [
  { id: "getting-started", label: "快速开始" },
  { id: "generic", label: "通用 API" },
  { id: "dujiao", label: "独角兽 (Dujiao-Next)" },
  { id: "acg", label: "异次元 (AcgFaka)" },
  { id: "endpoints", label: "接口一览" },
  { id: "orders", label: "报价与订单" },
  { id: "delivery", label: "发货与回调" },
  { id: "errors", label: "错误与重试" },
] as const;

function CodeBlock({
  title,
  lang,
  code,
}: {
  title: string;
  lang?: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800/90 bg-[#0d1421] text-slate-200 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800/90 bg-[#11192a] px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2 font-mono text-slate-300">
          <Terminal className="h-3.5 w-3.5 text-orange-400" />
          <span>{title}</span>
          {lang ? (
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              {lang}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition hover:border-orange-400/50 hover:text-white"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              已复制
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              复制
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-orange-200/80 bg-orange-50/80 px-1.5 py-0.5 font-mono text-[12px] font-medium text-orange-800">
      {children}
    </code>
  );
}

function MethodBadge({ method }: { method: "GET" | "POST" }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[46px] items-center justify-center rounded-md px-2 py-0.5 font-mono text-[11px] font-bold",
        method === "GET"
          ? "bg-sky-100 text-sky-700"
          : "bg-emerald-100 text-emerald-700"
      )}
    >
      {method}
    </span>
  );
}

export default function ApiDocsClient() {
  const [activeId, setActiveId] = useState<string>("getting-started");

  useEffect(() => {
    const elements = TOC_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => Boolean(el)
    );
    if (!elements.length || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-18% 0px -65% 0px", threshold: 0.05 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div id="top" className="min-h-screen bg-[#faf8f5] text-slate-900">
      {/* 顶部粘性导航 */}
      <header className="sticky top-0 z-40 border-b border-orange-100/90 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-xs font-extrabold text-white shadow-sm">
                JL
              </span>
              <span className="text-base font-bold tracking-tight text-slate-900">
                Jianlian
              </span>
            </Link>
            <span className="h-4 w-px bg-slate-200" />
            <span className="text-sm font-medium text-slate-500">供货 API 开发文档</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/account/api"
              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
            >
              <KeyRound className="h-3.5 w-3.5" />
              申请 API 凭证
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              返回商城
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero 区 */}
      <section className="border-b border-orange-100/80 bg-gradient-to-b from-orange-50/70 via-[#faf8f5] to-[#faf8f5]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:py-14">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-white px-3 py-1 text-xs font-semibold text-orange-700 shadow-2xs">
              <BookOpen className="h-3.5 w-3.5" />
              Jianlian 开放平台 · 统一供货协议 v1.0
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
              统一供货 API 开发文档
            </h1>
            <p className="max-w-xl text-sm leading-7 text-slate-600 sm:text-[15px]">
              面向自建商城、<strong>独角兽（Dujiao-Next）</strong> 与{" "}
              <strong>异次元（AcgFaka）</strong> 卡网的一体化供货接口规范。一套商户凭证即可查询实时库存、同步多规格 SKU、余额扣费下单并接收异步卡密交付。
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href="#getting-started"
                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700"
              >
                开始接入
                <ArrowDown className="h-4 w-4" />
              </a>
              <a
                href="#endpoints"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-orange-200 hover:text-orange-700"
              >
                接口一览
              </a>
              <Link
                href="/account/api"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                前往 API 控制台
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* 右侧深色响应预览卡 */}
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1421] shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 bg-[#11192a] px-4 py-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="rounded bg-sky-500/20 px-2 py-0.5 font-mono font-bold text-sky-300">
                  GET
                </span>
                <span className="truncate font-mono text-slate-300">
                  {BASE_URL}/api/v1/user/assets
                </span>
              </div>
              <span className="text-[11px] text-emerald-400">200 OK</span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-slate-200">
              <code>{`{
  "code": 200,
  "message": "success",
  "timestamp": 1795654000000,
  "data": {
    "userId": "a0dfaed2-8da4-415d-b6ed-696a40575886",
    "email": "partner@example.com",
    "balance": 500.00,
    "currency": "CNY",
    "rateLimit": {
      "limitPerMinute": 60,
      "remaining": 59
    }
  }
}`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* 移动端横向目录条 */}
      <div className="sticky top-16 z-30 border-b border-slate-200/80 bg-white/95 px-4 py-2 backdrop-blur-sm lg:hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {TOC_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                activeId === item.id
                  ? "bg-orange-100 text-orange-800"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {/* 主体：左侧粘性目录 + 右侧文档卡片 */}
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-10">
        {/* 左侧目录 */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-2">
            <div className="px-3 text-xs font-semibold tracking-wide text-slate-400">
              文档目录
            </div>
            <nav aria-label="开发文档目录" className="space-y-1">
              {TOC_ITEMS.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={cn(
                    "block rounded-xl px-3 py-2 text-sm font-medium transition",
                    activeId === item.id
                      ? "bg-orange-100/90 text-orange-800 shadow-2xs"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                  )}
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="mt-6 rounded-2xl border border-orange-100 bg-white p-3.5 text-xs text-slate-600 shadow-2xs">
              <div className="font-semibold text-slate-900">需要技术对接协助？</div>
              <p className="mt-1 leading-5 text-slate-500">
                开通独角兽 / 异次元专属协议、申请出口 IP 加白或排查联调问题，请联系在线客服。
              </p>
              <Link
                href="/faq"
                className="mt-2.5 inline-flex items-center gap-1 font-semibold text-orange-700 hover:underline"
              >
                前往工单与客服中心
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </aside>

        {/* 右侧各章节卡片 */}
        <main className="min-w-0 space-y-8">
          {/* 1. 快速开始 */}
          <section
            id="getting-started"
            className="scroll-mt-24 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs sm:p-8"
          >
            <h2 className="text-2xl font-bold text-slate-950">快速开始</h2>
            <p className="mt-2 text-sm text-slate-600">
              按以下 4 个步骤即可完成 Jianlian 供货 API 接入与联调验证。
            </p>

            <div className="mt-6 divide-y divide-slate-100">
              <div className="py-4 first:pt-0">
                <h3 className="text-sm font-bold text-slate-900">
                  1. 注册并提交 API 凭证申请
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  注册并登录 <Pill>{BASE_URL}</Pill>，前往{" "}
                  <Link href="/account/api" className="font-semibold text-orange-700 underline underline-offset-2">
                    「个人中心 → API 对接」
                  </Link>{" "}
                  填写商户名称、业务场景与服务器公网出口 IP，提交接入申请。
                </p>
              </div>
              <div className="py-4">
                <h3 className="text-sm font-bold text-slate-900">
                  2. 联系客服审核并加白出口 IP
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  提交申请后请通过{" "}
                  <Link href="/faq" className="font-semibold text-orange-700 underline underline-offset-2">
                    工单中心 / 在线客服
                  </Link>{" "}
                  告知注册邮箱、接入协议类型（通用 API / 独角兽 / 异次元）及服务器固定出口 IP。审核通过后，系统服务端将签发{" "}
                  <Pill>AppID</Pill> 与 <Pill>AppSecret</Pill>（密钥仅明文展示一次，请妥善保存至服务端环境变量）。
                </p>
              </div>
              <div className="py-4">
                <h3 className="text-sm font-bold text-slate-900">
                  3. 配置服务端接口地址与鉴权
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  所有接口请求发往 <Pill>{BASE_URL}</Pill>，路径与鉴权方式按下方所选协议配置。严禁在浏览器前端、客户端安装包或公开代码仓库中硬编码{" "}
                  <Pill>AppSecret</Pill>。
                </p>
              </div>
              <div className="py-4 last:pb-0">
                <h3 className="text-sm font-bold text-slate-900">
                  4. 先查余额与同步商品，再做微额实单联调
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  先调用余额与商品目录接口核对 SKU 编码、供货售价、实时库存与交付方式（自动发货 / 人工处理），确认无误后再用测试账号下小额订单验证卡密提取与回调验签。
                </p>
              </div>
            </div>

            {/* 3 张协议快跳卡 */}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <a
                href="#generic"
                className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-orange-300 hover:bg-orange-50/50"
              >
                <div>
                  <div className="text-sm font-bold text-slate-900 group-hover:text-orange-700">
                    通用 API
                  </div>
                  <div className="mt-1 text-xs text-slate-500">自建商城与定制系统</div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-orange-600" />
              </a>
              <a
                href="#dujiao"
                className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-orange-300 hover:bg-orange-50/50"
              >
                <div>
                  <div className="text-sm font-bold text-slate-900 group-hover:text-orange-700">
                    独角兽
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Dujiao-Next 原生协议</div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-orange-600" />
              </a>
              <a
                href="#acg"
                className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-orange-300 hover:bg-orange-50/50"
              >
                <div>
                  <div className="text-sm font-bold text-slate-900 group-hover:text-orange-700">
                    异次元
                  </div>
                  <div className="mt-1 text-xs text-slate-500">AcgFaka 自动发卡 / 增强异步</div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-orange-600" />
              </a>
            </div>
          </section>

          {/* 2. 通用 API */}
          <section
            id="generic"
            className="scroll-mt-24 space-y-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs sm:p-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-bold text-slate-950">通用 API</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                推荐自建商城使用
              </span>
            </div>
            <p className="text-sm leading-7 text-slate-600">
              路径前缀为 <Pill>/api/v1</Pill>。每次请求通过 HTTPS 发送鉴权头{" "}
              <Pill>Authorization: Bearer &lt;AppSecret&gt;</Pill> 与{" "}
              <Pill>X-Merchant-Id: &lt;AppID&gt;</Pill>（兼容 <Pill>X-Api-Key</Pill> /{" "}
              <Pill>X-Api-Secret</Pill>）。包含 JSON 请求体时请设置{" "}
              <Pill>Content-Type: application/json</Pill>，统一返回 UTF-8 JSON（以 HTTP 状态码与响应{" "}
              <Pill>code === 200</Pill> 共同判定成功）。
            </p>

            <CodeBlock
              title="cURL · 查询账户余额与商品目录"
              lang="bash"
              code={`# 1. 查询商户余额与限流配额
curl -sS "${BASE_URL}/api/v1/user/assets" \\
  -H "Authorization: Bearer \${JIANLIAN_APP_SECRET}" \\
  -H "X-Merchant-Id: \${JIANLIAN_APP_ID}" \\
  -H "Accept: application/json"

# 2. 获取全量在售商品列表
curl -sS "${BASE_URL}/api/v1/products" \\
  -H "Authorization: Bearer \${JIANLIAN_APP_SECRET}" \\
  -H "X-Merchant-Id: \${JIANLIAN_APP_ID}" \\
  -H "Accept: application/json"

# 3. 获取单个商品详情与全部 SKU 实时库存
curl -sS "${BASE_URL}/api/v1/products/chatgpt-plus" \\
  -H "Authorization: Bearer \${JIANLIAN_APP_SECRET}" \\
  -H "X-Merchant-Id: \${JIANLIAN_APP_ID}"`}
            />
          </section>

          {/* 3. 独角兽 (Dujiao-Next 原生协议) */}
          <section
            id="dujiao"
            className="scroll-mt-24 space-y-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs sm:p-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-bold text-slate-950">
                独角兽（Dujiao-Next 原生协议）
              </h2>
              <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 ring-1 ring-orange-200">
                HMAC-SHA256 防篡改签名 · 需客服开启商户网关
              </span>
            </div>

            <p className="text-sm leading-7 text-slate-600">
              针对使用 <strong>独角兽 Dujiao-Next</strong> 的下游卡网店铺，支持标准{" "}
              <Pill>/api/v1/upstream</Pill> 上游协议规范。对接地址填写{" "}
              <Pill>{BASE_URL}</Pill>，使用与通用 API 相同的{" "}
              <Pill>AppID</Pill>（填入 API Key）与 <Pill>AppSecret</Pill>（填入 API Secret）。
            </p>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700 space-y-2">
              <div className="font-semibold text-slate-900">签名请求头与 Canonical String 规则</div>
              <ul className="list-disc space-y-1.5 pl-5 text-xs leading-6 text-slate-600">
                <li>
                  <Pill>Dujiao-Next-Api-Key</Pill>：商户 <Pill>AppID</Pill>（API Key）。
                </li>
                <li>
                  <Pill>Dujiao-Next-Timestamp</Pill>：当前 Unix 秒级时间戳，服务端校验时钟误差不超过{" "}
                  <strong>60 秒</strong>。
                </li>
                <li>
                  <Pill>Dujiao-Next-Signature</Pill>：使用 <Pill>AppSecret</Pill> 对 Canonical String 计算{" "}
                  <strong>HMAC-SHA256</strong> 并输出小写十六进制字符串。
                </li>
                <li>
                  <strong>Canonical String 拼接顺序（以 <code>\n</code> 连接）</strong>：
                  <Pill>METHOD + &quot;\n&quot; + PATH + &quot;\n&quot; + TIMESTAMP + &quot;\n&quot; + MD5(RAW_BODY_BYTES)</Pill>
                  （其中 <Pill>PATH</Pill> 不包含查询参数；空请求体仍须对空字节串 <Pill>b&quot;&quot;</Pill> 计算 MD5）。
                </li>
              </ul>
            </div>

            <CodeBlock
              title="Python · Dujiao-Next 签名并测试连通性 / 查询余额"
              lang="python"
              code={`import hashlib, hmac, os, time, urllib.request

BASE = "${BASE_URL}"
API_KEY = os.environ["JIANLIAN_APP_ID"]
API_SECRET = os.environ["JIANLIAN_APP_SECRET"].encode("utf-8")

def sign_request(method: str, path: str, raw_body: bytes = b"") -> dict:
    ts = str(int(time.time()))
    body_md5 = hashlib.md5(raw_body).hexdigest()
    canonical = f"{method.upper()}\\n{path}\\n{ts}\\n{body_md5}"
    signature = hmac.new(API_SECRET, canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    return {
        "Dujiao-Next-Api-Key": API_KEY,
        "Dujiao-Next-Timestamp": ts,
        "Dujiao-Next-Signature": signature,
        "Content-Type": "application/json",
        "User-Agent": "Dujiao-Next-Client/1.0",
    }

path = "/api/v1/upstream/ping"
raw = b""
req = urllib.request.Request(BASE + path, data=raw, headers=sign_request("POST", path, raw), method="POST")
with urllib.request.urlopen(req, timeout=10) as resp:
    print(resp.status, resp.read().decode("utf-8"))`}
            />
          </section>

          {/* 4. 异次元 (AcgFaka) */}
          <section
            id="acg"
            className="scroll-mt-24 space-y-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs sm:p-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-bold text-slate-950">
                异次元（AcgFaka 卡网对接）
              </h2>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                兼容原版发卡 + 增强异步交付 · 需客服开通
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Layers className="h-4 w-4 text-orange-600" />
                  方式一：原版自动发卡货源对接
                </div>
                <p className="text-xs leading-6 text-slate-600">
                  适用于 AcgFaka 3.8.x 后台「货源对接」直连 CNY 单 SKU 自动发货卡密商品：
                </p>
                <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">
                  <li>货源站点 URL：<Pill>{BASE_URL}</Pill></li>
                  <li>商户 ID（AppID）：填写审核通过后的 <Pill>AppID</Pill></li>
                  <li>商户密钥（AppKey）：填写对应的 <Pill>AppSecret</Pill></li>
                  <li>
                    如首次下单因上游异步出货尚未返回卡密，异次元将保持「已付款、待发货」状态，待 Jianlian 出货后在异次元后台点击补拉卡密即可。
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Code2 className="h-4 w-4 text-orange-600" />
                  方式二：增强异步表单接口
                </div>
                <p className="text-xs leading-6 text-slate-600">
                  适用于多规格 SKU、人工代充、异步供应商履约等复杂商品，通过{" "}
                  <Pill>application/x-www-form-urlencoded</Pill> 提交 5 个固定表单字段：
                </p>
                <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">
                  <li>字段：<Pill>app_id</Pill>、<Pill>app_key</Pill>、<Pill>operation</Pill>、<Pill>payload</Pill>、<Pill>sign</Pill></li>
                  <li><Pill>payload</Pill> 为无填充 Base64URL 编码的 UTF-8 JSON 对象（编码前上限 16 KiB）</li>
                  <li><Pill>sign</Pill> 使用异次元标准 <Pill>App\Util\Str::generateSignature</Pill> 对前 4 个字段加签</li>
                </ul>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[540px] border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-2.5 font-semibold">operation 操作名</th>
                    <th className="px-4 py-2.5 font-semibold">payload JSON 示例</th>
                    <th className="px-4 py-2.5 font-semibold">用途说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold text-orange-700">balance</td>
                    <td className="px-4 py-2.5 font-mono">{"{}"}</td>
                    <td className="px-4 py-2.5">校验凭证并查询商户余额</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold text-orange-700">categories</td>
                    <td className="px-4 py-2.5 font-mono">{"{}"}</td>
                    <td className="px-4 py-2.5">拉取在售一级 / 二级分类目录</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold text-orange-700">products</td>
                    <td className="px-4 py-2.5 font-mono">{`{"page":1,"page_size":50}`}</td>
                    <td className="px-4 py-2.5">分页同步商品、SKU、售价与库存</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold text-orange-700">product</td>
                    <td className="px-4 py-2.5 font-mono">{`{"product_id":"prod_xxx"}`}</td>
                    <td className="px-4 py-2.5">获取单商品详情、规格列表与表单字段</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold text-orange-700">trade</td>
                    <td className="px-4 py-2.5 font-mono">{`{"sku_id":"...","quantity":1,"downstream_order_no":"SHOP-1001"}`}</td>
                    <td className="px-4 py-2.5">余额扣费提交采购订单（支持幂等单号）</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold text-orange-700">query</td>
                    <td className="px-4 py-2.5 font-mono">{`{"downstream_order_no":"SHOP-1001"}`}</td>
                    <td className="px-4 py-2.5">按商户侧单号查询订单状态与已交付卡密</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 5. 接口一览 */}
          <section
            id="endpoints"
            className="scroll-mt-24 space-y-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs sm:p-8"
          >
            <h2 className="text-2xl font-bold text-slate-950">接口一览</h2>
            <p className="text-sm text-slate-600">
              以下核心资源接口均部署于 <Pill>{BASE_URL}</Pill>，通用协议使用{" "}
              <Pill>/api/v1</Pill> 前缀，独角兽原生协议映射至 <Pill>/api/v1/upstream</Pill>。
            </p>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 font-semibold">方法</th>
                    <th className="px-4 py-3 font-semibold">接口路径（通用 API）</th>
                    <th className="px-4 py-3 font-semibold">功能与关键参数</th>
                    <th className="px-4 py-3 font-semibold">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr>
                    <td className="px-4 py-3"><MethodBadge method="GET" /></td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">/api/v1/user/assets</td>
                    <td className="px-4 py-3">校验凭证，查询当前商户 CNY 可用余额、账号状态及分钟级限流配额</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">已开放</span></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3"><MethodBadge method="GET" /></td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">/api/v1/products</td>
                    <td className="px-4 py-3">获取全部在售商品基础信息、售价、库存与交付类型（<Pill>automatic</Pill> / <Pill>manual</Pill>）</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">已开放</span></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3"><MethodBadge method="GET" /></td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">/api/v1/products/&#123;identifier&#125;</td>
                    <td className="px-4 py-3">按商品 UUID 或 Slug 查询完整详情与全部子规格 <Pill>skus[]</Pill>（含规格售价与实时库存）</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">已开放</span></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3"><MethodBadge method="GET" /></td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">/api/v1/orders/&#123;orderNo&#125;</td>
                    <td className="px-4 py-3">按平台订单号查询支付状态、交付状态及卡密内容（自动校验归属权限）</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">已开放</span></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3"><MethodBadge method="POST" /></td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">/api/v1/orders/create</td>
                    <td className="px-4 py-3">商户余额扣费自动下单，携带 <Pill>clientOrderId</Pill> 防重幂等键与可选 <Pill>callbackUrl</Pill></td>
                    <td className="px-4 py-3"><span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">白名单商户开通</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 6. 报价与订单 */}
          <section
            id="orders"
            className="scroll-mt-24 space-y-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs sm:p-8"
          >
            <h2 className="text-2xl font-bold text-slate-950">报价与订单</h2>
            <div className="space-y-3 text-sm leading-7 text-slate-600">
              <p>
                • <strong>金额与币种精度</strong>：全站统一使用 <Pill>CNY</Pill> 结算，商户侧请使用十进制小数类型（Decimal / 字符串）存储金额，避免二进制浮点数误差。
              </p>
              <p>
                • <strong>幂等单号规范</strong>：下单请求必须携带商户侧唯一订单号 <Pill>clientOrderId</Pill>（独角兽/异次元对应{" "}
                <Pill>downstream_order_no</Pill>），仅允许 1–64 位 ASCII 字符 <Pill>[A-Za-z0-9._:-]</Pill>。相同单号重复提交不会二次扣款。
              </p>
              <p>
                • <strong>多规格商品必传 SKU</strong>：对存在多个规格的商品，务必先通过{" "}
                <Pill>GET /api/v1/products/&#123;identifier&#125;</Pill> 同步具体 <Pill>sku_id</Pill>（或 <Pill>sku_code</Pill>），禁止只传父商品 ID 盲下单。
              </p>
            </div>

            <CodeBlock
              title="POST /api/v1/orders/create · 标准下单请求与响应示例"
              lang="json"
              code={`// Request Body (application/json)
{
  "productId": "ce1ca7e2-a12f-5d78-a6de-de7321c0e10f",
  "skuId": "b9c6370c-23f6-548b-bfd1-416fd6235e51",
  "quantity": 1,
  "clientOrderId": "SHOP-20261126-0001",
  "customerEmail": "buyer@example.com",
  "callbackUrl": "https://your-shop.com/api/webhook/jianlian"
}

// Response Body (200 OK)
{
  "code": 200,
  "message": "success",
  "timestamp": 1795654200000,
  "data": {
    "orderNo": "JL202611260850001234",
    "clientOrderId": "SHOP-20261126-0001",
    "status": "delivered",
    "paymentStatus": "paid",
    "deliveryStatus": "delivered",
    "amount": "29.25",
    "currency": "CNY",
    "cards": [
      "REDACTED_ACCOUNT_OR_PIN_LINE_1"
    ]
  }
}`}
            />
          </section>

          {/* 7. 发货与回调 */}
          <section
            id="delivery"
            className="scroll-mt-24 space-y-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs sm:p-8"
          >
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-orange-600" />
              <h2 className="text-2xl font-bold text-slate-950">发货与回调</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs leading-6 text-slate-600">
                <div className="font-bold text-slate-900">订单状态流转</div>
                <ul className="mt-2 space-y-1">
                  <li><Pill>paid</Pill> / <Pill>processing</Pill>：已扣款，正在调取本地库存或上游供应商出货，请等待回调或间隔轮询查单。</li>
                  <li><Pill>delivered</Pill> / <Pill>completed</Pill>：卡密已就绪，可通过查单接口提取交付内容。</li>
                  <li><Pill>manual_review</Pill>：上游采购异常或需人工核对，<strong>禁止自动重复下单</strong>，请等待客服处理或查单确认。</li>
                  <li><Pill>cancelled</Pill> / <Pill>refunded</Pill>：订单已取消或退款，请核对钱包流水。</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs leading-6 text-slate-600">
                <div className="font-bold text-slate-900">Webhook 异步回调规范</div>
                <ul className="mt-2 space-y-1">
                  <li>触发事件：<Pill>order.fulfilled</Pill>（已交付）与 <Pill>order.status_changed</Pill>（状态变更）。</li>
                  <li>回调地址必须为公网可访问的 <strong>HTTPS</strong> URL。</li>
                  <li>验签方式：校验请求头签名（HMAC-SHA256 + 60s 时间窗），务必使用<strong>常量时间比较</strong>防止时序攻击。</li>
                  <li>幂等响应：按 <Pill>orderNo</Pill> / <Pill>clientOrderId</Pill> 幂等落库后，返回 HTTP <Pill>200</Pill> 与 <Pill>{`{"ok":true}`}</Pill>。</li>
                </ul>
              </div>
            </div>

            <CodeBlock
              title="Node.js · Webhook 回调验签示例（常量时间比对）"
              lang="javascript"
              code={`import crypto from "node:crypto";

export function verifyJianlianCallback({ headers, rawBodyBuffer, appSecret }) {
  const ts = Number(headers["dujiao-next-timestamp"] || headers["x-jianlian-timestamp"]);
  const signature = String(headers["dujiao-next-signature"] || headers["x-jianlian-signature"] || "");
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60) {
    return false;
  }
  const bodyMd5 = crypto.createHash("md5").update(rawBodyBuffer).digest("hex");
  const canonical = \`POST\\n/api/v1/upstream/callback\\n\${ts}\\n\${bodyMd5}\`;
  const expected = crypto.createHmac("sha256", appSecret).update(canonical).digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`}
            />
          </section>

          {/* 8. 错误与重试 */}
          <section
            id="errors"
            className="scroll-mt-24 space-y-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs sm:p-8"
          >
            <h2 className="text-2xl font-bold text-slate-950">错误与重试</h2>

            <div className="flex items-start gap-3 rounded-2xl border-l-4 border-orange-500 bg-orange-50/80 p-4 text-sm text-orange-950">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
              <div>
                <div className="font-bold">核心铁律：请求超时先查原单，禁止盲目重下</div>
                <p className="mt-1 text-xs leading-6 text-orange-900/90">
                  当遇到网络超时、连接重置、HTTP <Pill>503</Pill> 或响应状态不明确时，必须先使用原{" "}
                  <Pill>clientOrderId</Pill> / <Pill>orderNo</Pill> 查询订单并核对账户余额流水；在未确认原单失败且未扣款前，严禁更换单号重新发起扣费下单。
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[580px] border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-2.5 font-semibold">HTTP / 错误码</th>
                    <th className="px-4 py-2.5 font-semibold">含义</th>
                    <th className="px-4 py-2.5 font-semibold">建议处理策略</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold text-rose-700">401 / 403</td>
                    <td className="px-4 py-2.5">鉴权失败或出口 IP 不在白名单</td>
                    <td className="px-4 py-2.5">核对 AppID / AppSecret、签名时间戳（±60s）及服务器公网出口 IP 是否已加白</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold text-rose-700">402 · insufficient_balance</td>
                    <td className="px-4 py-2.5">商户账户余额不足</td>
                    <td className="px-4 py-2.5">前往「账号充值」补充余额后再发起下单</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold text-amber-700">409 · insufficient_stock</td>
                    <td className="px-4 py-2.5">商品或所选 SKU 实时库存不足</td>
                    <td className="px-4 py-2.5">立即同步最新商品库存并暂停下游超卖</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold text-amber-700">409 · order_reference_conflict</td>
                    <td className="px-4 py-2.5">商户单号已存在且参数不一致</td>
                    <td className="px-4 py-2.5">查原单核对是否已下单成功，勿复用已使用单号</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold text-amber-700">429 · rate_limited</td>
                    <td className="px-4 py-2.5">触发频率限制（默认 60 次/分）</td>
                    <td className="px-4 py-2.5">对同步/查询做指数退避；下单遇 429 需先查原单再决定是否重试</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold text-rose-700">503 · order_requires_review</td>
                    <td className="px-4 py-2.5">上游采购结果待确认</td>
                    <td className="px-4 py-2.5">保留原单号等待查单或人工核对，严禁自动重试扣款</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs leading-6 text-slate-600">
              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                安全与日志脱敏最佳实践
              </div>
              <p className="mt-1">
                生产日志中必须对 <Pill>Authorization</Pill>、<Pill>AppSecret</Pill>、异次元{" "}
                <Pill>app_key</Pill> 以及返回体中的 <Pill>cards</Pill> / 卡密交付内容执行脱敏，切勿明文落盘或上报至第三方监控平台。
              </p>
            </div>
          </section>

          {/* 底部栏 */}
          <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-6 text-xs text-slate-500">
            <div>© 2026 Jianlian · 开放平台统一供货文档</div>
            <div className="flex items-center gap-4">
              <Link href="/account/api" className="hover:text-orange-700">
                API 控制台
              </Link>
              <Link href="/faq" className="hover:text-orange-700">
                在线客服
              </Link>
              <a
                href="#top"
                className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-orange-700"
              >
                返回顶部
                <ArrowUp className="h-3.5 w-3.5" />
              </a>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
