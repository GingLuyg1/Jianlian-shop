"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Chrome,
  Clock,
  ExternalLink,
  EyeOff,
  Globe2,
  Headphones,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wifi,
} from "lucide-react";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface GeminiTutorialProps {
  onGoToGoogleRegion?: () => void;
}

const regionSteps = [
  {
    num: "01",
    title: "切换至支持地区的稳定节点",
    icon: Wifi,
    desc: "使用 Gemini 支持地区的纯净稳定网络节点（推荐美国、日本、新加坡等，请避开中国大陆、香港、澳门及俄罗斯等受限节点），且在使用过程中保持节点稳定、不要频繁切换。",
  },
  {
    num: "02",
    title: "检查账号关联的国家 / 地区",
    icon: MapPin,
    desc: "保持目标地区节点，打开 Google 服务条款页面并滑至最底部，查看左下角的「国家/地区版本」。若仍显示为受限地区，需按文末教程修改 Google 账号归属地。",
    link: {
      href: "https://policies.google.com/terms",
      label: "查看 Google 服务条款归属地",
    },
  },
  {
    num: "03",
    title: "用无痕窗口重新打开 Gemini",
    icon: EyeOff,
    desc: "切换好稳定节点后，打开浏览器无痕 / 隐私窗口重新访问 gemini.google.com 登录，避免旧 Cookie 和浏览器缓存继续触发地区拦截。",
    link: {
      href: "https://gemini.google.com",
      label: "打开 gemini.google.com",
    },
  },
];

const somethingWrongSteps = [
  {
    step: "1",
    title: "刷新或重新登录",
    desc: "强制刷新当前页面，或先退出 Google 账号后重新登录测试。",
    icon: RefreshCw,
  },
  {
    step: "2",
    title: "无痕窗口打开",
    desc: "使用浏览器无痕 / 隐私模式打开 Gemini，排除缓存、旧 Cookie 与扩展插件干扰。",
    icon: EyeOff,
  },
  {
    step: "3",
    title: "更换稳定支持节点",
    desc: "更换更稳定、纯净度更高的 Gemini 支持地区节点（如美国节点），并确保代理规则完整覆盖 *.google.com。",
    icon: Globe2,
  },
  {
    step: "4",
    title: "更换浏览器再试",
    desc: "换用最新版 Chrome 或 Edge 等未安装过多插件的浏览器重新登录尝试。",
    icon: Chrome,
  },
  {
    step: "5",
    title: "稍后再试或联系客服",
    desc: "若上述步骤均无效，可等待片刻后再试；如为本站购买的 Gemini 成品号，请截图报错页面联系在线客服协助排查。",
    icon: Clock,
  },
];

export default function GeminiTutorial({ onGoToGoogleRegion }: GeminiTutorialProps) {
  return (
    <div className="space-y-6">
      {/* 顶部问题速览 */}
      <section className="rounded-2xl border border-orange-200/80 bg-gradient-to-r from-orange-50/80 via-amber-50/45 to-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-2.5">
            <h2 className="text-base font-bold text-slate-900">
              Gemini 常见无法使用问题排查指南
            </h2>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-600">
              日常访问 Gemini 时，最常见两类拦截报错：<strong>一、提示「在你所在的国家/地区不可用」</strong>，以及<strong>二、页面显示「Something went wrong」</strong>。请对照下方原因与排查顺序逐项处理。
            </p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <a
                href="#gemini-region-unavailable"
                className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-primary hover:bg-orange-50 transition-colors"
              >
                <span>一、提示在你所在的国家/地区不可用</span>
              </a>
              <a
                href="#gemini-something-wrong"
                className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-primary hover:bg-orange-50 transition-colors"
              >
                <span>二、页面显示「Something went wrong」</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 一、提示在你所在的国家/地区不可用 */}
      <section id="gemini-region-unavailable" className="scroll-mt-4 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-orange-100 pb-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            一
          </span>
          <h2 className="text-lg font-bold text-slate-900">
            提示在你所在的国家/地区不可用
          </h2>
        </div>

        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-1 text-xs sm:text-sm text-amber-900/90 leading-relaxed">
              <p className="font-semibold text-amber-950">原因说明</p>
              <p>
                Gemini 目前仅在部分国家和地区提供服务，中国大陆、香港等地区不在支持范围内。Google 会同时根据<strong>你当前的网络节点位置（IP）</strong>以及<strong>Google 账号关联的国家/地区</strong>来判断是否允许访问。
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {regionSteps.map(({ num, title, icon: Icon, desc, link }) => (
            <article
              key={num}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all hover:border-orange-200 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-orange-200/70 bg-orange-50 text-xs font-extrabold text-primary">
                    {num}
                  </span>
                  <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-xs sm:text-[13px] leading-relaxed text-slate-600">
                  {desc}
                </p>
              </div>
              {link ? (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <span>{link.label}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {/* 二、页面显示「Something went wrong」 */}
      <section id="gemini-something-wrong" className="scroll-mt-4 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-orange-100 pb-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            二
          </span>
          <h2 className="text-lg font-bold text-slate-900">
            页面显示「Something went wrong」
          </h2>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 sm:p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-xs sm:text-sm leading-relaxed text-slate-700">
              「Something went wrong」是一个笼统报错，常见原因为<strong>网络节点不稳定</strong>、<strong>当前节点地区不支持</strong>、<strong>浏览器缓存异常</strong>或<strong>第三方插件干扰</strong>。建议严格按以下 5 步顺序排查：
            </p>
          </div>

          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {somethingWrongSteps.map(({ step, title, desc, icon: Icon }) => (
              <li
                key={step}
                className="relative flex flex-col rounded-xl border border-orange-100/90 bg-gradient-to-b from-orange-50/40 to-white p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow-2xs">
                    {step}
                  </span>
                  <Icon className="h-4 w-4 text-primary/70" aria-hidden="true" />
                </div>
                <h3 className="mt-2.5 text-xs sm:text-sm font-bold text-slate-900">
                  {title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {desc}
                </p>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/40 px-4 py-3">
            <p className="text-xs text-slate-600">
              如果是本站购买的 Gemini 成品号，按以上 5 步排查后仍无法打开，请保存报错截图联系客服处理。
            </p>
            <button
              type="button"
              onClick={() => openPublicSupport()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-bold text-primary hover:bg-orange-50 transition-colors"
            >
              <Headphones className="h-3.5 w-3.5" />
              <span>联系在线客服</span>
            </button>
          </div>
        </div>
      </section>

      {/* 底部跳转：Google 修改国家/地区教程 */}
      <section
        data-testid="gemini-go-google-region"
        className="rounded-2xl border-2 border-primary/25 bg-gradient-to-r from-orange-50/90 via-amber-50/60 to-white p-5 sm:p-6 shadow-xs"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
              <Globe2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                延伸教程推荐
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                账号归属地不在支持地区？查看 Google 修改国家/地区教程
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                包含 Google 账号服务条款归属地查询、官方关联地区更改表单填写，以及 Google Play 商店锁区改区完整图文步骤。
              </p>
            </div>
          </div>

          {onGoToGoogleRegion ? (
            <button
              type="button"
              onClick={onGoToGoogleRegion}
              className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-gradient-to-r from-[#df7334] to-[#c85f22] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:from-[#d26728] hover:to-[#b85319] hover:shadow-md sm:self-center"
            >
              <span>前往 Google 修改国家/地区教程</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>
          ) : (
            <Link
              href="/tutorials?topic=google-region&guide=region"
              className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-gradient-to-r from-[#df7334] to-[#c85f22] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:from-[#d26728] hover:to-[#b85319] hover:shadow-md sm:self-center"
            >
              <span>前往 Google 修改国家/地区教程</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
