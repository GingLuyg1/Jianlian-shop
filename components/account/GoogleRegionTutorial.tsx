"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Globe2,
  Headphones,
  HelpCircle,
  MapPin,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import TutorialImage from "@/components/account/TutorialImage";
import { openPublicSupport } from "@/lib/support/open-public-support";
import tutorial from "@/components/account/TutorialsGlass.module.css";

interface GoogleRegionTutorialProps {
  onSwitchToQrSms?: () => void;
}

export default function GoogleRegionTutorial({ onSwitchToQrSms }: GoogleRegionTutorialProps) {
  return (
    <div className="space-y-6">
      {/* 扫码风控降级神器快捷入口横幅 */}
      <section className="rounded-2xl border border-blue-200/90 bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-blue-50/90 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                遇到 Google 桌面端强制要求手机扫码验证 (MO-SMS)？
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                推荐使用开源神器 <strong>Google QR SMS Helper</strong> 扩展插件，一键降级回传统的 6 位短信验证码。
              </p>
            </div>
          </div>
          {onSwitchToQrSms ? (
            <button
              type="button"
              onClick={onSwitchToQrSms}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition-all shrink-0"
            >
              <span>查看扫码降级教程</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Link
              href="/tutorials?topic=google-region&guide=qr-sms"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition-all shrink-0"
            >
              <span>查看扫码降级教程</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </section>

      {/* 重要前提准备 */}
      <section className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-amber-900">核心前提准备（必看）</h2>
            <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-xs sm:text-sm text-amber-800">
              <li>
                <strong>关闭定位权限</strong>：在操作前，请关闭电脑或手机的系统定位服务，尤其是关闭浏览器和 Google 相关 App 的位置权限，防止 IP 与物理 GPS 冲突。
              </li>
              <li>
                <strong>目标国家 IP 养号</strong>：必须全程使用您希望转入的<strong>目标国家（如美国）纯净原生节点</strong>登录。建议提前稳定登录并日常使用几天，避免节点频繁变动或被判定为异常代理，可大幅提升修改成功率。
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 第一部分：修改 Google 账户服务条款区域 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-orange-100 pb-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            1
          </span>
          <h2 className="text-lg font-bold text-slate-900">第一阶段：修改 Google 账户服务条款区域（主账号国家）</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <span className="text-xs rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">步骤 1</span>
              检查当前账号归属地
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              保持目标国家网络环境，浏览器打开 Google 服务条款页面。滑动至页面最底部，查看左下角的<strong>「国家/地区版本」</strong>。若已显示为目标国家（如美国），说明主条款已自动对齐；若仍为其他地区，请继续进行步骤 2。
            </p>
            <div className="pt-1">
              <a
                href="https://policies.google.com/terms"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                访问 Google 服务条款页面
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="mt-3">
              <TutorialImage
                src="/assets/tutorials/google/google-tos-country.png"
                caption="图 1：查看服务条款底部的国家/地区版本"
                width={597}
                height={475}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <span className="text-xs rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">步骤 2</span>
              提交官方国家/地区关联更改表单
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              若未自动切换，请登录后访问 Google 官方提供的「账号关联地区更改请求」表单。
            </p>
            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs sm:text-sm space-y-2 text-slate-700">
              <div className="font-semibold text-slate-900">表单填写技巧：</div>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>选择国家/地区</strong>：选择目标国家（如：美国）。</li>
                <li><strong>选择州</strong>：建议选择<strong>免税州</strong>（如俄勒冈 Oregon、特拉华 Delaware、蒙大拿 Montana、阿拉斯加 Alaska 等）。</li>
                <li><strong>更改原因</strong>：勾选「其他原因」或「我住在这里」。</li>
                <li><strong>原因陈述</strong>：可简要填写“因长期在当地生活与工作，需使用美区特定服务（如 Gemini / Google Voice），申请将账号关联归属地变更为当前地区”。</li>
              </ul>
            </div>
            <div className="pt-1">
              <a
                href="https://policies.google.com/country-association-form"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                打开 Google 国家/地区关联更改表单
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="mt-3">
              <TutorialImage
                src="/assets/tutorials/google/google-country-form.jpg"
                caption="图 2：填写账号关联地区更改请求表单"
                width={728}
                height={1024}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 第二部分：修改 Google Play 商店及付款资料区域 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-orange-100 pb-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            2
          </span>
          <h2 className="text-lg font-bold text-slate-900">第二阶段：修改 Google Play 商店与锁区/转区（关键步骤）</h2>
        </div>

        <div className="space-y-6">
          {/* 步骤 1：关闭旧付款资料 */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 space-y-3">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                1
              </span>
              清理与关闭旧的付款资料
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              打开 <a href="https://pay.google.com/" target="_blank" rel="noreferrer" className="text-primary underline">Google 付款中心 (pay.google.com)</a>，点击顶部导航栏的<strong>【设置】</strong>，滑动到最下方找到「支付资料状态」，点击<strong>【关闭支付资料】</strong>，按提示确认关闭。
            </p>
            <div className="mt-2">
              <TutorialImage
                src="/assets/tutorials/google/google-close-profile.png"
                caption="图 3：在付款中心设置中关闭旧的支付资料"
                width={982}
                height={780}
              />
            </div>
          </div>

          {/* 步骤 2：添加新区域支付方式 */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 space-y-3">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                2
              </span>
              进入钱包添加支付方式
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              关闭旧资料并刷新页面后，点击进入<strong>【支付方式】</strong>选项卡，页面将提示「尚未添加付款方式？」，点击蓝色的<strong>【添加支付方式】</strong>按钮。
            </p>
            <div className="mt-2">
              <TutorialImage
                src="/assets/tutorials/google/google-pay-entry.png"
                caption="图 4：点击添加支付方式进入锁区绑定流程"
                width={861}
                height={493}
              />
            </div>
          </div>

          {/* 步骤 3：绑定卡片与特别注意 */}
          <div className="rounded-2xl border-2 border-primary/25 bg-gradient-to-b from-orange-50/60 to-white p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold text-slate-900">
                步骤 3：绑定目标国家卡片（核心要点）
              </h3>
            </div>

            {/* 用户特别要求重点说明 */}
            <div className="rounded-xl border border-orange-200 bg-white p-4 shadow-xs">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">
                    境外银行卡与虚拟信用卡获取说明：
                  </p>
                  <p className="text-xs sm:text-sm leading-relaxed text-slate-700">
                    👉 <strong>如果你有境外银行卡</strong>，直接输入卡号、持卡人姓名并配合目标地区真实账单地址即可；<br />
                    👉 <strong>如果你没有境外银行卡</strong>，可以联系我们在线客服购买虚拟信用卡（专门配套用于 Google 绑卡、锁区、改区与海外订阅消费）。
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => openPublicSupport()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#d86628] transition-colors"
                    >
                      <Headphones className="h-3.5 w-3.5" />
                      联系在线客服购买虚拟信用卡
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs sm:text-sm text-slate-600">
              <p>
                <strong>账单地址填写提示</strong>：国家/地区选择美国（US），街道地址、市/区、州和邮编建议通过真实地址生成工具生成对应免税州的真实地址填入。
              </p>
              <p className="text-slate-500">
                * 小技巧：在最后点击保存时，即使由于风控或预授权提示发卡机构拒绝，也<strong>直接点击取消</strong>。此时后台已将该 Google 账号的 Play 商店档案成功固定锁定为该目标国家！
              </p>
            </div>

            <div className="mt-3">
              <TutorialImage
                src="/assets/tutorials/google/google-add-card.png"
                caption="图 5：填写卡号及目标国家账单地址进行锁区"
                width={855}
                height={888}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 第三部分：验证与常见问题 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-orange-100 pb-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            3
          </span>
          <h2 className="text-lg font-bold text-slate-900">第三阶段：手机端 Google Play 查验与注意事项</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              手机端 Google Play 查验
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              稍等片刻让数据同步完成，在安卓手机上打开 <strong>Google Play 商店</strong> → 点击右上角头像 → <strong>【设置】</strong> → <strong>【常规】</strong> → <strong>【账号和设备偏好设置】</strong>。
            </p>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              此时在「国家/地区和个人资料」一栏中，即可看到已显示为<strong>目标国家（如美国）并带有蓝色勾选图标</strong>，证明换区已大功告成！
            </p>
            <div className="mt-3">
              <TutorialImage
                src="/assets/tutorials/google/google-play-verify.jpg"
                caption="图 6：Google Play 成功切换为目标国家并锁定"
                width={547}
                height={812}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              重要注意事项
            </h3>
            <div className="space-y-2.5 rounded-xl border border-slate-200/80 bg-white p-4 text-xs sm:text-sm text-slate-700">
              <div className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <p><strong>一年限改一次规则</strong>：Google 官方对 Play 商店的区域切换有严格的一年周期限制，换区成功后一年内将无法再次随意切换，请谨慎确定目标区域。</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <p><strong>余额清空说明</strong>：如果旧区域还有 Google Play 礼品卡充值余额，关闭旧资料或换区会导致旧区域余额无法跨区转移使用，请在换区前用尽。</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <p><strong>家庭组影响</strong>：若账号当前加入了 Google Family 家庭组，通常无法直接跨区，需先退出家庭组后再执行换区操作。</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
