const methods = [
  {
    name: "菲区卡充",
    subtitle: "菲律宾区银行卡充值",
    account: "适合当前没有有效订阅，或处于免费版状态的账号。",
    scenarios: ["当前账号没有订阅", "当前账号处于免费版", "希望通过菲律宾区银行卡方式完成充值"],
    method: "通过菲律宾区银行卡渠道完成充值。",
    features: ["价格通常更有优势。"],
  },
  {
    name: "iOS 端充值",
    subtitle: "Apple App Store 充值",
    account: "账号已有订阅的情况下，也可以使用这种充值方式。",
    scenarios: ["当前没有订阅", "免费版账号", "已有订阅，希望继续充值或续费", "需要通过 App Store 完成充值的账号"],
    method: "通过 iOS 端 Apple App Store 完成充值。",
    features: ["使用方式更灵活", "更适合续费场景", "对已有订阅账号兼容性更好", "更适合部分已有订阅或续费场景。"],
  },
] as const;

function DetailList({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h4>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-slate-600">
        {values.map((value) => <li key={value} className="flex gap-2"><span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-orange-500" /><span>{value}</span></li>)}
      </ul>
    </div>
  );
}

export default function ChatGptRechargeMethodComparison() {
  return (
    <section data-testid="chatgpt-recharge-method-comparison" className="rounded-2xl border border-orange-200 bg-orange-50/40 p-5">
      <h3 className="text-lg font-bold text-slate-950">菲区卡充与 iOS 端充值的区别</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">两种充值方式适用于不同的账号状态，请根据当前账号情况选择合适的方式。</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">本区块仅提供充值方式选择指南，不表示当前商品同时包含两种方式；请以当前商品说明和实际交付信息为准。</p>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {methods.map((item) => (
          <article key={item.name} className="min-w-0 rounded-xl border border-orange-100 bg-white p-4">
            <h4 className="text-base font-bold text-slate-950">{item.name}</h4>
            <p className="mt-0.5 text-xs text-orange-700">{item.subtitle}</p>
            <div className="mt-4 space-y-4">
              <div><h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">账号状态</h5><p className="mt-2 text-sm leading-6 text-slate-600">{item.account}</p></div>
              <DetailList label="适用场景" values={item.scenarios} />
              <div><h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">充值方式</h5><p className="mt-2 text-sm leading-6 text-slate-600">{item.method}</p></div>
              <DetailList label="特点" values={item.features} />
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-orange-100 bg-white px-4 py-3">
        <h4 className="text-sm font-semibold text-slate-950">设备使用说明</h4>
        <p className="mt-1 text-sm leading-6 text-slate-600">充值完成后，可按对应账号及服务本身支持的设备正常使用，包括电脑、手机和平板；具体以官方服务规则为准。</p>
      </div>
    </section>
  );
}
