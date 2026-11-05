import { Crown, Sparkles } from "lucide-react";

import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";
import { membershipProgress, membershipTiers } from "@/lib/account/membership-display";

export default function AccountMembership({ totalSpend, loading }: { totalSpend: number | null; loading: boolean }) {
  const progress = loading ? null : membershipProgress(totalSpend);
  const amount = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  return <section className={`${glass.surface} ${styles.panel} ${styles.vipPanel}`} aria-labelledby="membership-title">
    <header className={styles.sectionHeading}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={`${glass.icon} h-11 w-11`}><Crown className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" /></span>
        <div><h2 id="membership-title" className="text-base font-semibold text-slate-900">VIP 权益</h2><p className="mt-1 text-xs text-slate-500">累计消费与阶梯折扣</p></div>
      </div>
      <span className={styles.pill}>暂未开放</span>
    </header>
    <div className={styles.vipSummary}>
      <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-medium text-[#98754e]"><Sparkles className="h-4 w-4" aria-hidden="true" />{progress ? `VIP${progress.current.level} · ${progress.current.discount}` : "会员权益"}</p><p className="mt-2 text-xs leading-5 text-slate-500">折扣暂未开放，当前订单价格不变</p></div>
      <div className="shrink-0 text-right"><p className="text-xs text-slate-500">累计消费</p><p className="mt-2 text-xl font-semibold text-[#a66b39]">{loading || totalSpend === null ? "/" : `¥${totalSpend.toFixed(2)}`}</p></div>
    </div>
    <div className="mt-5" aria-label="会员成长进度">
      <div role="progressbar" aria-label="累计消费成长进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ? Number(progress.percent.toFixed(1)) : undefined} aria-valuetext={progress ? `${progress.percent.toFixed(1)}%` : "读取中"} className={styles.vipProgress}><span style={{ width: `${progress?.percent ?? 0}%` }} /></div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{!progress ? "正在读取累计消费…" : progress.next ? `累计 ¥${amount(progress.spend)} / ¥${amount(progress.next.threshold)}，再消费 ¥${amount(progress.remaining)} 可达 VIP${progress.next.level}（${progress.percent.toFixed(1)}%）` : "已达到 VIP3 展示等级"}</p>
    </div>
    <details className={styles.vipDetails} open>
      <summary className="w-fit cursor-pointer rounded-md text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">查看等级与权益</summary>
      <div className={styles.vipLevels}>
        {membershipTiers.map(tier => <div className={styles.vipLevel} data-current={progress?.current.level === tier.level || undefined} key={tier.level}><p className="flex items-center gap-2 text-sm font-semibold text-[#8c7156]"><Crown className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />VIP{tier.level}</p><p className="mt-3 text-xs text-slate-600">{tier.discount}</p><p className="mt-2 text-xs text-slate-500">累计 ¥{amount(tier.threshold)}</p></div>)}
      </div>
    </details>
  </section>;
}
