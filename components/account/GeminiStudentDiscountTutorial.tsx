"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  ExternalLink,
  GraduationCap,
  Headphones,
  Info,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Zap,
} from "lucide-react";
import TutorialImage from "@/components/account/TutorialImage";
import { openPublicSupport } from "@/lib/support/open-public-support";

interface GeminiStudentDiscountTutorialProps {
  onGoToGoogleRegion?: () => void;
}

const cardFields = [
  { field: "Card number", desc: "卡号" },
  { field: "MM/YY", desc: "有效期（月/年）" },
  { field: "CVV", desc: "安全码" },
  { field: "Cardholder name", desc: "持卡人姓名（全大写英文拼音）" },
  { field: "Billing zip code", desc: "美国账单地址中的邮编" },
  { field: "Country/region", desc: "United States (US)" },
];

export default function GeminiStudentDiscountTutorial({
  onGoToGoogleRegion,
}: GeminiStudentDiscountTutorialProps) {
  return (
    <div className="space-y-6">
      {/* 文章简介 */}
      <section className="rounded-2xl border border-orange-200/80 bg-gradient-to-r from-orange-50/85 via-amber-50/45 to-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">文章简介</h2>
              <span className="inline-flex items-center rounded-full border border-orange-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                最高享 74% 折扣 · 最长 4 年
              </span>
            </div>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-700">
              想低成本用上 Google 旗下的 <strong>Google AI Pro</strong>（含更高级别的 Gemini 与 Antigravity 额度 + <strong>5 TB 云存储空间</strong>），却卡在「账号地区受限」？本文为你整理了一套从零到一的完整实操流程，涵盖核心两大环节：
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2 pt-1">
              <div className="rounded-xl border border-orange-100 bg-white/90 px-3.5 py-2.5 text-xs leading-relaxed text-slate-700">
                <strong className="text-slate-900">1. 优惠申请：</strong>
                进入 Google 大学生专属优惠页面并完成官方学生身份核验（SheerID）。
              </div>
              <div className="rounded-xl border border-orange-100 bg-white/90 px-3.5 py-2.5 text-xs leading-relaxed text-slate-700">
                <strong className="text-slate-900">2. 绑卡订阅：</strong>
                在 Google Play 绑定虚拟卡并开通按月自动续费。
              </div>
            </div>
            <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
              <strong>费用参考：</strong>Google AI Pro 学生优惠最高可享 74% 折扣、最长 4 年，美区参考价约 <strong>8.99 美元/月</strong>（实际扣款含少量交易费约 9.08 美元）。
            </div>
          </div>
        </div>
      </section>

      {/* 一、申请 Google AI Pro 大学生专属优惠 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-sm font-extrabold text-primary">
            一
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              申请 Google AI Pro 大学生专属优惠
            </h2>
            <p className="text-xs text-slate-500">
              按步骤完成优惠入口选择与 SheerID 学生身份验证
            </p>
          </div>
        </div>

        {/* 步骤 1 */}
        <article className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-extrabold text-primary border border-orange-200/70">
              01
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm leading-relaxed text-slate-800">
                打开 Google Gemini 学生优惠官方入口：{" "}
                <a
                  href="https://gemini.google/students/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  https://gemini.google/students/
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                ，点击页面中央的 <strong>「免费学生计划」</strong>。
              </p>
            </div>
          </div>
          <TutorialImage
            src="/assets/tutorials/gemini-student/step-1.webp"
            caption="图 1：Google Gemini 学生计划首页 — 点击「免费学生计划」"
            width={998}
            height={489}
          />
        </article>

        {/* 步骤 2 */}
        <article className="space-y-3.5 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-extrabold text-primary border border-orange-200/70">
              02
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm leading-relaxed text-slate-800">
                进入「大学生专属优惠」套餐对比页后，建议选择右侧的 <strong>Google AI Pro</strong>（含 5 TB 存储空间，并解锁 Antigravity 等更完整的 AI 权益），点击下方的 <strong>「获取学生优惠」</strong>。
              </p>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900">
                <Info className="h-4 w-4 shrink-0 text-amber-600" />
                <span>登录过程中如果提示「所在地区不支持」，可先修改谷歌账号归属地区：</span>
                {onGoToGoogleRegion ? (
                  <button
                    type="button"
                    onClick={onGoToGoogleRegion}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-primary shadow-2xs ring-1 ring-orange-200 transition-colors hover:bg-orange-50"
                  >
                    <span>参考修改谷歌账号地址教程</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                ) : (
                  <Link
                    href="/tutorials?topic=google-region&guide=region"
                    className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-primary shadow-2xs ring-1 ring-orange-200 transition-colors hover:bg-orange-50"
                  >
                    <span>参考修改谷歌账号地址教程</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          </div>
          <TutorialImage
            src="/assets/tutorials/gemini-student/step-2.webp"
            caption="图 2：套餐对比页 — 选择右侧 Google AI Pro「获取学生优惠」"
            width={960}
            height={770}
          />
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs leading-relaxed text-slate-700 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-blue-900">
              <Lightbulb className="h-4 w-4 text-blue-600" />
              <span>小贴士</span>
            </div>
            <p>• 页面显示的币种和价格会随账号地区/IP 变化（例如美区约 8.99 美元/月，泰区显示为 189 泰铢/月），以实际结算区为准。</p>
            <p>• 左侧的 Google AI Plus 虽然可免费使用 12 个月，但模型与高级权限较有限；如果以深度使用高阶模型和 Antigravity 为主，建议直接选右侧的 <strong>Pro</strong> 方案。</p>
          </div>
        </article>

        {/* 步骤 3 */}
        <article className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-extrabold text-primary border border-orange-200/70">
              03
            </span>
            <p className="text-sm leading-relaxed text-slate-800">
              如果页面没有直接展示右侧的优惠卡片，可以向下滑动页面，点击底部的 <strong>「查看所有学生优惠」</strong> 展开完整列表。
            </p>
          </div>
          <TutorialImage
            src="/assets/tutorials/gemini-student/step-3.webp"
            caption="图 3：页面底部「查看所有学生优惠」按钮"
            width={951}
            height={234}
          />
        </article>

        {/* 步骤 4 */}
        <article className="space-y-3.5 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-extrabold text-primary border border-orange-200/70">
              04
            </span>
            <p className="text-sm leading-relaxed text-slate-800">
              在弹出的 <strong>「核实学生身份」</strong> 窗口中确认当前登录的 Google 账号无误，点击 <strong>「继续」</strong>，页面将自动跳转至官方认证页面（<code>services.sheerid.com</code>）。
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TutorialImage
              src="/assets/tutorials/gemini-student/step-4.webp"
              caption="图 4：「核实学生身份」确认弹窗 — 点击「继续」"
              width={423}
              height={160}
            />
            <TutorialImage
              src="/assets/tutorials/gemini-student/step-5.webp"
              caption="图 5：SheerID 官方学生身份验证页面（复制地址栏完整链接）"
              width={1280}
              height={575}
            />
          </div>
        </article>

        {/* 步骤 5：学生认证获取方式 */}
        <article className="space-y-3.5 rounded-2xl border border-orange-200/90 bg-gradient-to-br from-orange-50/55 via-white to-amber-50/35 p-4 sm:p-5 shadow-2xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-extrabold text-white">
                05
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  学生认证获取方式（内置极速认证教程）
                </h3>
                <p className="text-xs sm:text-sm leading-relaxed text-slate-600">
                  可直接通过本站下单获取 <strong>Gemini 学生认证 SheerID 极速认证兑换卡密（CDK）</strong>，全自动提交认证，通常 5~15 分钟即可完成。
                </p>
              </div>
            </div>
            <Link
              href="/checkout?p=gemini-student-sheerid-verify"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#df7334] to-[#c85f22] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:from-[#d26728] hover:to-[#b85319]"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>前往获取学生认证</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="rounded-xl border border-orange-200/70 bg-white p-4 space-y-2 text-xs sm:text-sm leading-relaxed text-slate-700">
            <div className="flex items-center gap-1.5 font-bold text-orange-800">
              <Zap className="h-4 w-4 text-primary" />
              <span>极速认证 3 步使用流程</span>
            </div>
            <p>
              <strong>步骤 1：</strong>下单自动获取认证卡密（CDK），前往兑换地址{" "}
              <a
                href="https://student.ezapi.site/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline underline-offset-4"
              >
                https://student.ezapi.site/
              </a>{" "}
              输入卡密并点击验证。
            </p>
            <p>
              <strong>步骤 2：</strong>在支持地区网络环境下访问{" "}
              <a
                href="https://one.google.com/ai-student"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline underline-offset-4"
              >
                https://one.google.com/ai-student
              </a>
              ，点击「获取学生优惠」→ 弹窗点击「继续」进入 SheerID 表单页面，复制浏览器地址栏中的完整表单链接（或对应验证 ID）。
            </p>
            <p>
              <strong>步骤 3：</strong>回到{" "}
              <a
                href="https://student.ezapi.site/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline underline-offset-4"
              >
                https://student.ezapi.site/
              </a>{" "}
              将自己的 SheerID 表单链接/ID 放进去并提交，等待约 5~15 分钟即可完成认证。
            </p>
          </div>

          <TutorialImage
            src="/assets/tutorials/gemini-student/step-6.webp"
            caption="图 6：本站「Gemini 学生认证 SheerID 极速认证」商品详情与使用说明"
            width={1245}
            height={853}
          />
        </article>

        {/* 步骤 6 */}
        <article className="space-y-2 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-extrabold text-primary border border-orange-200/70">
              06
            </span>
            <p className="text-sm leading-relaxed text-slate-800">
              审核通过后，返回原页面刷新，或重新打开{" "}
              <a
                href="https://gemini.google/students/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline underline-offset-4"
              >
                https://gemini.google/students/
              </a>{" "}
              重复上述步骤，再次点击右侧 Google AI Pro 下的 <strong>「获取学生优惠」</strong>，此时系统会弹出绑定支付方式的窗口。
            </p>
          </div>
        </article>
      </section>

      {/* 二、绑定 Google Play 并完成订阅 */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-sm font-extrabold text-primary">
              二
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                绑定 Google Play 并完成订阅
              </h2>
              <p className="text-xs text-slate-500">
                添加可用于 Google Play 扣款的支付卡并确认开通订阅
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openPublicSupport}
            className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50/80 px-3.5 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-orange-100/80"
          >
            <Headphones className="h-3.5 w-3.5" />
            <span>没有卡号？联系客服购买</span>
          </button>
        </div>

        {/* 绑卡步骤 1 & 2 */}
        <article className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-extrabold text-primary border border-orange-200/70">
              01
            </span>
            <p className="text-sm leading-relaxed text-slate-800">
              回到 Google 订阅的付款方式弹窗，点击 <strong>「Add card」</strong>。
            </p>
          </div>

          <TutorialImage
            src="/assets/tutorials/gemini-student/step-7.webp"
            caption="图 7：Google Play 添加付款方式弹窗 — 点击「Add card」"
            width={774}
            height={640}
          />

          <div className="flex items-start gap-3 pt-1">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-extrabold text-primary border border-orange-200/70">
              02
            </span>
            <div className="min-w-0 flex-1 space-y-2.5">
              <p className="text-sm leading-relaxed text-slate-800">
                按下方字段对照填写卡片与账单邮编信息：
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {cardFields.map((item) => (
                  <div
                    key={item.field}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs"
                  >
                    <span className="font-mono font-bold text-slate-800">{item.field}</span>
                    <span className="text-right text-slate-600">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <TutorialImage
            src="/assets/tutorials/gemini-student/step-8.webp"
            caption="图 8：信用卡信息填写对照图"
            width={730}
            height={676}
          />

          <div className="flex items-start gap-3 pt-1">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-extrabold text-emerald-700 border border-emerald-200">
              03
            </span>
            <p className="text-sm leading-relaxed text-slate-800">
              点击保存并确认付款，只要卡内余额充足即可成功开通 <strong>Google AI Pro</strong> 会员。
            </p>
          </div>
        </article>

        {/* 续费提示 */}
        <section className="rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50/80 via-orange-50/45 to-white p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700">
              <RefreshCw className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-950">续费提示</h3>
              <p className="text-xs sm:text-sm leading-relaxed text-slate-700">
                Google AI Pro 订阅为按月自动扣款（美区约 8.99 美元/月），请尽量提前确保卡内留有充足余额，以免扣款失败导致会员权益中断。
              </p>
            </div>
          </div>
        </section>

        {/* 底部快捷协助 */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <BadgeCheck className="h-4 w-4 text-primary shrink-0" />
            <span>需要获取 SheerID 学生认证卡密，或购买用于绑卡订阅的虚拟卡？</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/checkout?p=gemini-student-sheerid-verify"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-primary/90"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>购买学生认证</span>
            </Link>
            <button
              type="button"
              onClick={openPublicSupport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3.5 py-2 text-xs font-bold text-primary shadow-2xs transition-colors hover:bg-orange-50"
            >
              <CreditCard className="h-3.5 w-3.5" />
              <span>联系客服买卡</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
