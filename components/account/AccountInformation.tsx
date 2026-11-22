"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, KeyRound, Mail, ShieldCheck, Sparkles, Store, Terminal } from "lucide-react";

import glass from "@/components/account/AccountGlass.module.css";
import styles from "@/components/account/AccountCenter.module.css";

type MerchantApiStatus = "unapplied" | "pending" | "approved";

export default function AccountInformation({ email, loading }: { email: string | null; loading: boolean }) {
  const [apiStatus, setApiStatus] = useState<MerchantApiStatus>("unapplied");
  const [appId, setAppId] = useState<string>("");
  const [secretKey, setSecretKey] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = email ? `jianlian_developer_key_${email}` : "jianlian_developer_key_default";
    const appKey = email ? `jianlian_mch_app_id_${email}` : "jianlian_mch_app_id_default";
    const appStatusKey = email ? `jianlian_mch_app_status_${email}` : "jianlian_mch_app_status_default";

    const savedStatus = window.localStorage.getItem(appStatusKey) as MerchantApiStatus | null;
    const savedKey = window.localStorage.getItem(storageKey);
    const savedAppId = window.localStorage.getItem(appKey);

    if (savedStatus) {
      setApiStatus(savedStatus);
      if (savedKey) setSecretKey(savedKey);
      if (savedAppId) setAppId(savedAppId);
    } else if (savedKey) {
      // 兼容已有生成的 developer key
      setApiStatus("approved");
      setSecretKey(savedKey);
      const generatedId = `MCH_${Math.abs(hashString(email || "user")).toString().slice(0, 8).padEnd(8, "0")}`;
      setAppId(generatedId);
      window.localStorage.setItem(appKey, generatedId);
      window.localStorage.setItem(appStatusKey, "approved");
    }
  }, [email]);

  function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  const maskedSecret = secretKey
    ? `${secretKey.slice(0, 8)}••••••••••••${secretKey.slice(-4)}`
    : "—";

  return (
    <div className="grid min-w-0 gap-4" data-testid="account-information">
      <section className={`${glass.surface} ${styles.panel} ${styles.information}`} aria-labelledby="account-information-title">
        <header className={styles.sectionHeading}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={`${glass.icon} h-10 w-10`}><Store className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /></span>
            <div>
              <h2 id="account-information-title" className="text-base font-semibold text-slate-900">商户与API凭证</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">商户身份、开放接口凭证与加白管理。</p>
            </div>
          </div>
          <Link
            href="/account/api"
            className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white/90 px-3 py-1 text-xs font-semibold text-primary shadow-2xs hover:bg-orange-50 transition-colors"
          >
            <span>{apiStatus === "approved" ? "管理凭证" : "申请 API"}</span>
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </header>

        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* 1. 商户 ID */}
          <div className={`${glass.inset} ${styles.informationItem}`}>
            <dt className="flex items-center gap-2 text-xs text-slate-500">
              <Store className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden="true" />
              商户 ID (AppID)
            </dt>
            <dd className="mt-5 text-sm font-bold font-mono text-slate-800">
              {apiStatus === "approved" ? (
                appId || "MCH_10082691"
              ) : apiStatus === "pending" ? (
                <span className="text-amber-600 font-sans text-xs font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" /> 审核通过后分配
                </span>
              ) : (
                <span className="text-slate-400 font-sans text-xs font-normal">暂未开通</span>
              )}
            </dd>
          </div>

          {/* 2. 商户密钥 */}
          <div className={`${glass.inset} ${styles.informationItem}`}>
            <dt className="flex items-center gap-2 text-xs text-slate-500">
              <KeyRound className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden="true" />
              商户密钥 (AppSecret)
            </dt>
            <dd className="mt-5 text-sm font-medium font-mono text-slate-800 truncate" title={secretKey || undefined}>
              {apiStatus === "approved" ? (
                maskedSecret
              ) : apiStatus === "pending" ? (
                <span className="text-amber-600 font-sans text-xs font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" /> 待管理员签发
                </span>
              ) : (
                <span className="text-slate-400 font-sans text-xs font-normal">暂未开通</span>
              )}
            </dd>
          </div>

          {/* 3. API 申请与接入状态 (彻底替换原「登录手机 暂未开放」) */}
          <div className={`${glass.inset} ${styles.informationItem}`}>
            <dt className="flex items-center gap-2 text-xs text-slate-500">
              <Terminal className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden="true" />
              API 接口状态
            </dt>
            <dd className="mt-5 flex items-center justify-between gap-2">
              {apiStatus === "approved" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  已开通 · 生产环境
                </span>
              ) : apiStatus === "pending" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  申请审核中
                </span>
              ) : (
                <Link
                  href="/account/api"
                  className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-bold text-white shadow-2xs hover:bg-orange-600 transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  立即去申请
                </Link>
              )}
            </dd>
          </div>

          {/* 4. 登录邮箱 */}
          <div className={`${glass.inset} ${styles.informationItem}`}>
            <dt className="flex items-center gap-2 text-xs text-slate-500">
              <Mail className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden="true" />
              登录邮箱
            </dt>
            <dd className="mt-5 min-w-0 truncate text-sm font-semibold text-slate-800" title={email || undefined}>
              {loading ? <span className="block h-5 w-28 animate-pulse rounded bg-orange-100/60 motion-reduce:animate-none" aria-label="正在读取登录邮箱" /> : email || "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className={`${glass.inset} ${styles.panel} ${styles.securityNote}`} aria-labelledby="account-security-note">
        <span className={`${glass.icon} h-10 w-10`}><ShieldCheck className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 id="account-security-note" className="text-sm font-semibold text-slate-800">安全与接口规范</h2>
          <ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-5 text-slate-500">
            <li>API 接口与商户凭证严禁暴露在客户端网页或公开代码仓库中。</li>
            <li><strong>IP 白名单安全策略</strong>：为保障商户资金安全，调用接口的服务器外网 IP 由平台后台统一审核加白，商户不可自行添加。</li>
            <li>如需加白新 IP 或变更机房出口，请在管理中心提交工单或联系专属客服办理。</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
