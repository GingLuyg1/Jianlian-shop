import type { ReactNode } from "react";
import {
  AppWindow,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Laptop,
  RefreshCcw,
  Smartphone,
  Sparkles,
} from "lucide-react";

const methods = [
  {
    name: "菲区卡充",
    subtitle: "菲律宾区银行卡充值",
    icon: CreditCard,
    account: "适合当前没有有效订阅，或处于免费版状态的账号。",
    scenarios: ["当前账号没有订阅", "当前账号处于免费版", "希望使用菲律宾区银行卡渠道"],
    method: "通过菲律宾区银行卡渠道完成充值。",
    features: ["价格通常更有优势", "适合新开通或免费版账号"],
  },
  {
    name: "iOS 端充值",
    subtitle: "Apple App Store 充值",
    icon: AppWindow,
    account: "没有订阅、免费版或已有订阅的账号，均可按商品说明选择。",
    scenarios: ["当前没有订阅或处于免费版", "已有订阅，希望继续充值或续费", "需要通过 App Store 完成充值"],
    method: "通过 iOS 端 Apple App Store 完成充值。",
    features: ["使用方式更灵活", "更适合续费场景", "更适合部分已有订阅账号"],
  },
] as const;

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof CheckCircle2;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2.5 border-t border-slate-100 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-50 text-orange-600">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h5 className="text-xs font-semibold text-slate-500">{label}</h5>
        <div className="mt-1 text-sm leading-6 text-slate-700">{children}</div>
      </div>
    </div>
  );
}

function CompactList({ values }: { values: readonly string[] }) {
  return (
    <ul className="space-y-1">
      {values.map((value) => (
        <li key={value} className="flex gap-2">
          <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-orange-500" aria-hidden="true" />
          <span>{value}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ChatGptRechargeMethodComparison() {
  return (
    <section
      data-testid="chatgpt-recharge-method-comparison"
      className="overflow-hidden rounded-2xl border border-orange-200 bg-white"
    >
      <div className="border-b border-orange-100 bg-orange-50/70 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
            <RefreshCcw className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-950">菲区卡充与 iOS 端充值的区别</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              两种充值方式适用于不同的账号状态，请根据当前账号情况选择合适的方式。
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              本区块仅提供充值方式选择指南，不表示当前商品同时包含两种方式；请以当前商品说明和实际交付信息为准。
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 md:grid-cols-2">
        {methods.map((item, index) => {
          const MethodIcon = item.icon;
          return (
            <article key={item.name} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40">
              <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  <MethodIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-orange-600">方式 {index + 1}</span>
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span className="truncate text-xs text-slate-500">{item.subtitle}</span>
                  </div>
                  <h4 className="mt-0.5 text-base font-bold text-slate-950">{item.name}</h4>
                </div>
              </div>

              <div className="px-4 py-3.5">
                <InfoRow icon={Smartphone} label="账号状态">{item.account}</InfoRow>
                <InfoRow icon={Sparkles} label="适用场景"><CompactList values={item.scenarios} /></InfoRow>
                <InfoRow icon={CreditCard} label="充值方式">{item.method}</InfoRow>
                <InfoRow icon={CircleDollarSign} label="特点"><CompactList values={item.features} /></InfoRow>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mx-4 mb-4 flex items-start gap-3 rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3 sm:mx-5 sm:mb-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-orange-600">
          <Laptop className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h4 className="text-sm font-semibold text-slate-950">设备使用说明</h4>
          <p className="mt-0.5 text-sm leading-6 text-slate-600">
            充值完成后，可按对应账号及服务本身支持的设备正常使用，包括电脑、手机和平板；具体以官方服务规则为准。
          </p>
        </div>
      </div>
    </section>
  );
}
