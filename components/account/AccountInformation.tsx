import { KeyRound, Mail, ShieldCheck, Smartphone, Store } from "lucide-react";

import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";

export default function AccountInformation({ email, loading }: { email: string | null; loading: boolean }) {
  return (
    <div className="grid min-w-0 gap-4" data-testid="account-information">
      <section className={`${glass.surface} ${styles.panel} ${styles.information}`} aria-labelledby="account-information-title">
        <header className={styles.sectionHeading}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={`${glass.icon} h-10 w-10`}><Store className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /></span>
            <div><h2 id="account-information-title" className="text-base font-semibold text-slate-900">账户信息</h2><p className="mt-1 text-xs leading-5 text-slate-500">账户身份与登录信息，请妥善保管。</p></div>
          </div>
          <span className={styles.pill}>安全资料</span>
        </header>
        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "商户 ID", icon: Store },
            { label: "商户密钥", icon: KeyRound },
            { label: "登录手机", icon: Smartphone },
          ].map(({ label, icon: Icon }) => (
            <div key={label} className={`${glass.inset} ${styles.informationItem}`}>
              <dt className="flex items-center gap-2 text-xs text-slate-500"><Icon className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden="true" />{label}</dt>
              <dd className="mt-5 text-sm font-medium text-slate-400">暂未开放</dd>
            </div>
          ))}
          <div className={`${glass.inset} ${styles.informationItem}`}>
            <dt className="flex items-center gap-2 text-xs text-slate-500"><Mail className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden="true" />登录邮箱</dt>
            <dd className="mt-5 min-w-0 truncate text-sm font-semibold text-slate-800" title={email || undefined}>
              {loading ? <span className="block h-5 w-28 animate-pulse rounded bg-orange-100/60 motion-reduce:animate-none" aria-label="正在读取登录邮箱" /> : email || "—"}
            </dd>
          </div>
        </dl>
      </section>
      <section className={`${glass.inset} ${styles.panel} ${styles.securityNote}`} aria-labelledby="account-security-note">
        <span className={`${glass.icon} h-10 w-10`}><ShieldCheck className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /></span>
        <div className="min-w-0"><h2 id="account-security-note" className="text-sm font-semibold text-slate-800">安全提示</h2>
          <ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-5 text-slate-500">
            <li>请勿向他人泄露登录密码、验证码或密钥。</li>
            <li>请妥善保管登录邮箱，以便接收账户通知和找回账号。</li>
            <li>发现异常订单或账户活动，请及时联系在线客服。</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
