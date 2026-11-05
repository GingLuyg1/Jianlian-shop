import { Crown, Sparkles } from "lucide-react";

import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";

export default function AccountMembership({ totalSpend, loading }: { totalSpend: number | null; loading: boolean }) {
  return <section className={`${glass.surface} ${styles.panel} ${styles.vipPanel}`} aria-labelledby="membership-title">
    <header className={styles.sectionHeading}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={`${glass.icon} h-11 w-11`}><Crown className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" /></span>
        <div><h2 id="membership-title" className="text-base font-semibold text-slate-900">VIP 权益</h2><p className="mt-1 text-xs text-slate-500">会员等级与专属礼遇</p></div>
      </div>
      <span className={styles.pill}>暂未开放</span>
    </header>
    <div className={styles.vipSummary}>
      <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-medium text-[#98754e]"><Sparkles className="h-4 w-4" aria-hidden="true" />会员权益即将开放</p><p className="mt-2 text-xs leading-5 text-slate-500">等级、折扣及成长规则暂未开放</p></div>
      <div className="shrink-0 text-right"><p className="text-xs text-slate-500">累计消费</p><p className="mt-2 text-xl font-semibold text-[#a66b39]">{loading || totalSpend === null ? "/" : `¥${totalSpend.toFixed(2)}`}</p></div>
    </div>
    <details className={styles.vipDetails}>
      <summary className="w-fit cursor-pointer rounded-md text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">查看等级与权益</summary>
      <div className={styles.vipLevels}>
        {[0, 1, 2, 3].map(level => <div className={styles.vipLevel} key={level}><p className="flex items-center gap-2 text-sm font-semibold text-[#8c7156]"><Crown className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />VIP{level}</p><p className="mt-3 text-xs text-slate-400">暂未开放</p></div>)}
      </div>
    </details>
  </section>;
}
