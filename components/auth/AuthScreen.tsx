"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSafeInternalRedirect } from "@/lib/auth/redirect";
import { getAuthSiteOrigin } from "@/lib/auth/site-origin";
import {
  PENDING_SIGNUP_KEY,
  encodePendingSignup,
  decodePendingSignup,
  type PendingSignup,
} from "@/lib/auth/pending-signup";
import {
  getSafeAuthErrorMessage,
  getSafeNetworkAuthMessage,
  isEmailFormatValid,
  validateAuthPassword,
} from "@/lib/auth/password-policy";
import { cn } from "@/lib/utils";
import AlternateLoginMethods from "@/components/auth/AlternateLoginMethods";
import EmailVerificationForm from "@/components/auth/EmailVerificationForm";
import AnimatedCharacters from "@/components/auth/AnimatedCharacters";
import {
  getOrCreateProfile,
  getSupabaseBrowserClient,
  getSupabaseConfigStatus,
  hasSupabaseConfig,
} from "@/lib/supabase/client";

type AuthMode = "login" | "register";

type AuthScreenProps = {
  mode: AuthMode;
};

const features = ["安全账号", "快速下单", "订单查询"];

function getAuthRedirectUrl(path: string) {
  const origin = getAuthSiteOrigin(
    typeof window === "undefined" ? undefined : window.location.origin
  );
  return `${origin}${path}`;
}

async function getLoginRestrictionMessage(
  supabase: ReturnType<typeof getSupabaseBrowserClient>,
  userId: string,
  strict = true
) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("account_status,risk_status")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data)
      return strict ? "暂时无法确认账户状态，请稍后登录。" : "";
    if (data?.account_status === "disabled")
      return "账户已被禁用，请联系客服。";
    if (data?.risk_status === "blocked")
      return "账户当前受限，请联系客服。";
    return "";
  } catch {
    return strict ? "暂时无法确认账户状态，请稍后登录。" : "";
  }
}

export default function AuthScreen({ mode: initialMode }: AuthScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 内部受控的当前登录/注册模式，平滑切换不刷新
  const [currentMode, setCurrentMode] = useState<AuthMode>(initialMode);
  const isRegister = currentMode === "register";

  const redirectTo = useMemo(
    () => getSafeInternalRedirect(searchParams?.get("redirect") ?? null),
    [searchParams]
  );
  const inviteFromUrl = useMemo(
    () => searchParams?.get("invite") || searchParams?.get("salt") || "",
    [searchParams]
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpSending, setOtpSending] = useState(false);
  const [inviteCode, setInviteCode] = useState(inviteFromUrl);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [registration, setRegistration] = useState<PendingSignup | null>(null);
  const [inlinePendingSignup, setInlinePendingSignup] = useState<PendingSignup | null>(null);
  const pendingDesiredPasswordRef = useRef<string>("");

  // 卡通角色动效状态
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const authMainRef = useRef<HTMLElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  const triggerSuccessWithButtonRipple = () => {
    setLoginSuccess(true);

    // 手机端不应用登录后的水幕涟漪转场效果，直接流畅进入目标页
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const isMobileViewport =
      window.innerWidth < 1024 ||
      document.documentElement.dataset.mobilePreview === "true" ||
      window.matchMedia?.("(pointer: coarse)").matches === true;
    if (isMobileViewport) return;

    // 严格按照打磨实验室黄金参数挂载全屏水幕涟漪转场到 document.body（全程 pointer-events: none，底层瞬间切入 100% 真实可交互首页）：
    // - 扩散总时长 (Duration): 2.8s
    // - 水幕羽化虚化度 (Blur): 40px
    // - 冲击波环数 (Wave Rings): 2 环（从登录按钮精确边框轮廓向外泛起涟漪）
    {
      try {
        const DURATION_MS = 2800;
        const BLUR_PX = 40;
        const WAVE_RINGS = 2;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let btnRect = {
          left: vw * 0.72 - 170,
          top: vh * 0.58 - 22,
          width: 340,
          height: 44,
        };
        if (submitBtnRef.current) {
          const r = submitBtnRef.current.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            btnRect = { left: r.left, top: r.top, width: r.width, height: r.height };
          }
        }
        const originX = btnRect.left + btnRect.width / 2;
        const originY = btnRect.top + btnRect.height / 2;
        const maxDist = Math.hypot(
          Math.max(originX, vw - originX),
          Math.max(originY, vh - originY)
        );
        const targetRadius = maxDist * 1.15;
        const startRadius = Math.max(20, Math.min(btnRect.width, btnRect.height) * 0.52);

        const existing = document.getElementById("jianlian-login-ripple-portal");
        if (existing) existing.remove();

        const host = document.createElement("div");
        host.id = "jianlian-login-ripple-portal";
        host.setAttribute("aria-hidden", "true");
        host.style.cssText =
          "position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;";

        // 1. 顶层 1:1 登录页水幕快照：全程 pointer-events: none，以 40px 柔焦羽化水幕在 2.8s 内从登录按钮向外融化揭开真实首页
        let snapshotLayer: HTMLElement | null = null;
        if (authMainRef.current) {
          const cloned = authMainRef.current.cloneNode(true) as HTMLElement;
          cloned.style.cssText =
            "position:fixed;inset:0;width:100vw;height:100vh;margin:0;pointer-events:none;z-index:1;overflow:hidden;will-change:mask-image,-webkit-mask-image,opacity,transform;";
          cloned.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
          host.appendChild(cloned);
          snapshotLayer = cloned;
        }

        // 2. 从登录按钮精确边框泛起的 2 环香槟白金光学冲击波
        const ringBox = document.createElement("div");
        ringBox.style.cssText =
          "position:fixed;inset:0;pointer-events:none;z-index:2;overflow:hidden;";
        host.appendChild(ringBox);

        const finalDiameter = targetRadius * 2;
        const ringBorder = "2.5px solid rgba(254, 243, 199, 0.92)";
        const ringBoxShadow =
          "0 0 50px 18px rgba(251, 191, 36, 0.45), inset 0 0 40px 12px rgba(255, 255, 255, 0.9)";

        for (let i = 0; i < WAVE_RINGS; i++) {
          const ring = document.createElement("div");
          ring.style.cssText = [
            "position:absolute",
            `left:${originX}px`,
            `top:${originY}px`,
            `width:${btnRect.width}px`,
            `height:${btnRect.height}px`,
            "border-radius:12px",
            `border:${ringBorder}`,
            `box-shadow:${ringBoxShadow}`,
            `filter:blur(${Math.max(1, BLUR_PX * 0.25)}px)`,
            "transform:translate(-50%,-50%)",
            "pointer-events:none",
            "opacity:0",
            "will-change:width,height,border-radius,opacity",
          ].join(";");
          ringBox.appendChild(ring);

          const delayMs = i * 160;
          const ringDurationMs = Math.round(DURATION_MS * 0.9);
          ring.animate(
            [
              {
                width: `${btnRect.width}px`,
                height: `${btnRect.height}px`,
                borderRadius: "12px",
                opacity: 0.96,
              },
              {
                width: `${finalDiameter * 0.45}px`,
                height: `${finalDiameter * 0.45}px`,
                borderRadius: "50%",
                opacity: 0.78,
                offset: 0.4,
              },
              {
                width: `${finalDiameter * 1.08}px`,
                height: `${finalDiameter * 1.08}px`,
                borderRadius: "50%",
                opacity: 0,
              },
            ],
            {
              duration: ringDurationMs,
              delay: delayMs,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)",
              fill: "forwards",
            }
          );
        }

        document.body.appendChild(host);

        // 3. 60fps 逐帧平滑驱动 40px 羽化径向水幕（精确模拟 cubic-bezier(0.16, 1, 0.3, 1) 液态减速曲线）
        const startTime = performance.now();
        const easeLiquid = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

        const step = (now: number) => {
          const elapsed = now - startTime;
          const raw = Math.min(1, Math.max(0, elapsed / DURATION_MS));
          const eased = easeLiquid(raw);

          if (snapshotLayer) {
            const currentR = startRadius + (targetRadius - startRadius) * eased;
            const currentBlur = BLUR_PX * (1 + eased);
            const grad = `radial-gradient(circle at ${originX}px ${originY}px, transparent ${currentR.toFixed(1)}px, black ${(currentR + currentBlur).toFixed(1)}px)`;
            snapshotLayer.style.webkitMaskImage = grad;
            snapshotLayer.style.maskImage = grad;
            snapshotLayer.style.transform = `scale(${(1 + 0.03 * eased).toFixed(4)})`;
            snapshotLayer.style.opacity = raw > 0.78 ? String(Math.max(0, 1 - (raw - 0.78) / 0.22)) : "1";
          }

          if (raw < 1) {
            window.requestAnimationFrame(step);
          } else {
            host.remove();
          }
        };

        window.requestAnimationFrame(step);
        // 安全清理兜底，绝不残留任何 DOM
        window.setTimeout(() => {
          if (host.isConnected) host.remove();
        }, DURATION_MS + 350);
      } catch {}
    }
  };

  // 当外部传入的 initialMode 变更时同步，并预热真实首页路由
  useEffect(() => {
    setCurrentMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    try {
      router.prefetch(redirectTo || "/");
    } catch {}
  }, [redirectTo, router]);

  useEffect(() => {
    if (!isRegister) return;
    try {
      const pending = decodePendingSignup(window.sessionStorage.getItem(PENDING_SIGNUP_KEY));
      if (pending) setRegistration(pending);
      else window.sessionStorage.removeItem(PENDING_SIGNUP_KEY);
    } catch {
      /* Verification remains usable when browser storage is unavailable. */
    }
  }, [isRegister]);

  function forgetPendingSignup() {
    try {
      window.sessionStorage.removeItem(PENDING_SIGNUP_KEY);
    } catch {
      /* No credentials are stored. */
    }
  }

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  const handleSendRegisterOtp = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isEmailFormatValid(normalizedEmail)) {
      setError("请输入正确的邮箱地址后再获取验证码。");
      return;
    }
    const config = getSupabaseConfigStatus();
    if (!config.ok) {
      setError("登录服务暂时不可用，请稍后重试。");
      return;
    }
    setError("");
    setMessage("");
    setOtpSending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const normalizedInviteCode = inviteCode.trim().toUpperCase();

      // 若同一邮箱已通过本表单发起过 signUp，则调用 resend 重发验证码
      if (inlinePendingSignup && inlinePendingSignup.email === normalizedEmail) {
        const { error: resendError } = await supabase.auth.resend({
          type: "signup",
          email: normalizedEmail,
        });
        if (resendError) {
          setError(
            getSafeAuthErrorMessage(
              resendError,
              "验证码发送过于频繁或服务暂不可用，请稍后重试。"
            )
          );
          return;
        }
        setOtpCountdown(60);
        setMessage("验证码已重新发送至您的邮箱，请查收（如未收到请检查垃圾箱）。");
        toast.success("验证码已重新发送至您的邮箱，请查收。");
        return;
      }

      // 允许用户仅填写邮箱即可先获取验证码：若此时尚未填写8位密码，先使用一次性高强度临时密码发起 signUp，待用户点击注册验证成功后自动同步更新为用户填写的真实密码
      const hasValidTypedPassword = !validateAuthPassword(password);
      const bootstrapPassword = hasValidTypedPassword
        ? password
        : `Jl_${
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}_${Math.random().toString(36).slice(2)}`
          }_9A!`;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: bootstrapPassword,
        options: {
          emailRedirectTo: getAuthRedirectUrl(
            `/auth/callback?next=${encodeURIComponent("/account")}`
          ),
          data: {
            ...(normalizedInviteCode
              ? { invite_code: normalizedInviteCode }
              : {}),
          },
        },
      });

      if (signUpError) {
        setError(
          getSafeAuthErrorMessage(
            signUpError,
            "验证码发送失败，请稍后重试。"
          )
        );
        return;
      }

      if (data.session) {
        await supabase.auth.signOut({ scope: "local" });
        setError("注册服务尚未启用邮箱确认，请稍后重试。");
        return;
      }

      if (!data.user) {
        setError("无法发起邮箱验证，请稍后重试。");
        return;
      }

      const pending: PendingSignup = {
        email: normalizedEmail,
        userId: data.user.id,
        invite: normalizedInviteCode,
      };
      setInlinePendingSignup(pending);
      try {
        window.sessionStorage.setItem(
          PENDING_SIGNUP_KEY,
          encodePendingSignup(pending)
        );
      } catch {
        /* No password/token persistence. */
      }

      setOtpCountdown(60);
      setMessage("验证码已发送至您的邮箱，请查收（如未收到请检查垃圾箱或拦截列表）。");
      toast.success("验证码已发送至您的邮箱，请查收。");
    } catch (sendException) {
      setError(getSafeNetworkAuthMessage(sendException));
    } finally {
      setOtpSending(false);
    }
  };

  // 模式切换平滑更新 URL，不刷新页面
  const switchMode = (nextMode: AuthMode) => {
    if (currentMode === nextMode) return;
    setCurrentMode(nextMode);
    setError("");
    setMessage("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.pathname = nextMode === "register" ? "/register" : "/login";
      window.history.replaceState(null, "", url.toString());
    }
  };

  async function verifyRegistration(
    code: string,
    overridePending?: PendingSignup,
    desiredPassword?: string
  ) {
    const activeTarget = overridePending ?? registration;
    if ((!overridePending && loading) || !activeTarget) return;
    return verifyPendingRegistration(code, activeTarget, desiredPassword);
  }

  async function verifyPendingRegistration(
    code: string,
    registration: PendingSignup,
    desiredPassword?: string
  ) {
    setError("");
    setMessage("");
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: registration.email,
        token: code,
        type: "signup",
      });
      if (verifyError) {
        setError(
          getSafeAuthErrorMessage(
            verifyError,
            "验证码无效或已过期，请重新获取。"
          )
        );
        return;
      }
      if (!data.session || data.user?.id !== registration.userId || !data.user.email_confirmed_at) {
        if (data.session) await supabase.auth.signOut({ scope: "local" });
        setError("无法确认此注册，请重新开始。");
        return;
      }
      const effectiveDesiredPassword = desiredPassword || pendingDesiredPasswordRef.current;
      if (effectiveDesiredPassword && !validateAuthPassword(effectiveDesiredPassword)) {
        const { error: updatePwdError } = await supabase.auth.updateUser({
          password: effectiveDesiredPassword,
        });
        if (updatePwdError) {
          await supabase.auth.signOut({ scope: "local" });
          setError(
            getSafeAuthErrorMessage(
              updatePwdError,
              "密码设置失败，请稍后重试。"
            )
          );
          return;
        }
      }
      pendingDesiredPasswordRef.current = "";
      await getOrCreateProfile(supabase, data.user);
      const restriction = await getLoginRestrictionMessage(supabase, data.user.id, true);
      if (restriction) {
        await supabase.auth.signOut({ scope: "local" });
        setError(restriction);
        return;
      }
      if (registration.invite) {
        const { error: bindError } = await supabase.rpc(
          "bind_referrer_by_code",
          {
            input_invite_code: registration.invite,
          }
        );
        if (bindError) {
          await supabase.auth.signOut({ scope: "local" });
          setError("注册邮箱已验证，邀请码绑定失败，请联系客服。");
          return;
        }
      }
      toast.success("邮箱已验证，注册完成。");
      triggerSuccessWithButtonRipple();
      setRegistration(null);
      setInlinePendingSignup(null);
      forgetPendingSignup();
      router.replace("/account");
      window.setTimeout(() => {
        if (window.location.pathname === "/login" || window.location.pathname === "/register") {
          window.location.replace("/account");
        }
      }, 450);
    } catch {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      setError("注册验证暂时不可用，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function resendRegistrationCode() {
    if (loading || !registration) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const { error: resendError } = await getSupabaseBrowserClient().auth.resend({
        type: "signup",
        email: registration.email,
      });
      if (resendError) {
        setError(
          getSafeAuthErrorMessage(
            resendError,
            "暂时无法重发验证码，请稍后重试。"
          )
        );
        return;
      }
      setMessage("验证码已重新发送，请使用最新一封邮件。");
    } catch {
      setError("暂时无法重发验证码，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const reason = searchParams?.get("auth_error");
    if (reason === "restricted")
      setError("账户已被禁用或暂时受限，请联系客服。");
    else if (reason === "invite")
      setError("邀请关系绑定失败，请联系客服核实。");
    else if (reason === "invalid_link")
      setError("登录链接已过期或无效，请重新登录。");
    else if (reason === "config") setError("登录服务暂时不可用。");
  }, [searchParams]);

  useEffect(() => {
    const invite = inviteFromUrl.trim();
    if (!invite || !hasSupabaseConfig()) return;

    async function recordPromotionVisit() {
      const visitorKey =
        window.localStorage.getItem("jianlian_visitor_key") ||
        window.crypto.randomUUID();
      window.localStorage.setItem("jianlian_visitor_key", visitorKey);

      try {
        const { error } = await getSupabaseBrowserClient().rpc(
          "record_promotion_visit",
          {
            input_invite_code: invite,
            input_visitor_key: visitorKey,
          }
        );

        if (error) {
          console.warn("[Promotion] Failed to record visit");
        }
      } catch {
        console.warn("[Promotion] Failed to record visit");
      }
    }

    recordPromotionVisit();
  }, [inviteFromUrl]);

  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    let active = true;

    getSupabaseBrowserClient()
      .auth.getUser()
      .then(async ({ data }) => {
        if (!active || !data.user) return;
        const restriction = await getLoginRestrictionMessage(
          getSupabaseBrowserClient(),
          data.user.id
        );
        if (!active) return;
        if (restriction) {
          await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
          setError(restriction);
          return;
        }
        forgetPendingSignup();
        router.replace(redirectTo === "/" ? "/account" : redirectTo);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [redirectTo, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const config = getSupabaseConfigStatus();
    if (!config.ok) {
      const configMessage =
        config.message ?? "Supabase URL 或 Key 未配置，请检查环境变量。";
      console.warn("[Supabase Auth] Missing public config");
      setError(configMessage);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!isEmailFormatValid(normalizedEmail)) {
      setError("请输入正确的邮箱地址。");
      return;
    }

    const passwordError = validateAuthPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (isRegister) {
      if (!acceptedTerms) {
        setError("请先阅读并同意用户协议。");
        return;
      }
    }

    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();

      if (isRegister) {
        const normalizedInviteCode = inviteCode.trim().toUpperCase();

        // 若用户已点击「获取验证码」完成了 signUp，则直接校验验证码并将用户输入的密码同步写入账户
        if (inlinePendingSignup && inlinePendingSignup.email === normalizedEmail) {
          const pendingWithInvite: PendingSignup = {
            ...inlinePendingSignup,
            invite: normalizedInviteCode || inlinePendingSignup.invite,
          };
          const typedPassword = password;
          pendingDesiredPasswordRef.current = typedPassword;
          if (emailOtp.trim()) {
            await verifyRegistration(emailOtp.trim(), pendingWithInvite, typedPassword);
            return;
          }
          setRegistration(pendingWithInvite);
          setPassword("");
          return;
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(
              `/auth/callback?next=${encodeURIComponent("/account")}`
            ),
            data: {
              ...(normalizedInviteCode
                ? { invite_code: normalizedInviteCode }
                : {}),
            },
          },
        });

        if (signUpError) {
          setError(
            getSafeAuthErrorMessage(
              signUpError,
              "注册服务暂时不可用，请稍后重试。"
            )
          );
          return;
        }

        if (data.session) {
          await supabase.auth.signOut({ scope: "local" });
          setError("注册服务尚未启用邮箱确认，请稍后重试。");
          return;
        }
        if (!data.user) {
          setError("无法开始邮箱验证，请稍后重试。");
          return;
        }
        const pending = {
          email: normalizedEmail,
          userId: data.user.id,
          invite: normalizedInviteCode,
        };
        try {
          window.sessionStorage.setItem(
            PENDING_SIGNUP_KEY,
            encodePendingSignup(pending)
          );
        } catch {
          /* No password/token persistence. */
        }
        setInlinePendingSignup(pending);
        setRegistration(pending);
        setPassword("");

        // 若用户已在表单中填入邮箱验证码，则直接校验完成注册
        if (emailOtp.trim()) {
          await verifyRegistration(emailOtp.trim(), pending);
          return;
        }
        return;
      }

      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (signInError) {
        setError(
          getSafeAuthErrorMessage(signInError, "邮箱或密码不正确。")
        );
        setPassword("");
        return;
      }

      if (!signInData?.session || !signInData.user?.email_confirmed_at) {
        await supabase.auth.signOut({ scope: "local" });
        setError("邮箱尚未验证，请先完成注册验证。");
        return;
      }
      if (signInData.user) {
        await getOrCreateProfile(supabase, signInData.user).catch(() =>
          console.warn("[Supabase Auth] Failed to prepare profile")
        );

        const loginRestriction = await getLoginRestrictionMessage(
          supabase,
          signInData.user.id
        );
        if (loginRestriction) {
          await supabase.auth.signOut({ scope: "local" });
          setMessage("");
          setError(loginRestriction);
          return;
        }
      }

      triggerSuccessWithButtonRipple();
      const targetUrl = redirectTo || "/";
      router.replace(targetUrl);
      // 防止 Next.js 客户端导航偶发被阻塞，若 450ms 后仍滞留登录页则安全直跳真实目标页
      window.setTimeout(() => {
        if (window.location.pathname === "/login" || window.location.pathname === "/register") {
          window.location.replace(targetUrl);
        }
      }, 450);
    } catch (authException) {
      console.warn("[Supabase Auth] Network or runtime exception");
      setError(getSafeNetworkAuthMessage(authException));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main ref={authMainRef} className="relative min-h-screen overflow-hidden bg-[#fff6ee] text-foreground">
      {/* 优化后的高级暖色微光背景 */}
      <div className="pointer-events-none fixed -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-[#ffd9b3] via-[#ffc68a] to-[#ffb366] opacity-60 blur-3xl" />
      <div className="pointer-events-none fixed -right-24 top-1/4 h-[520px] w-[520px] rounded-full bg-gradient-to-tr from-[#ffe6cc] via-[#ffd2a8] to-[#ffb885] opacity-55 blur-3xl" />
      <div className="pointer-events-none fixed bottom-[-160px] left-1/3 h-[420px] w-[420px] rounded-full bg-gradient-to-t from-[#ffcf9e] to-[#ffe8d1] opacity-45 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6">
        <div className="flex items-center justify-start">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-orange-200/60 backdrop-blur transition-all hover:scale-[1.02] hover:bg-white hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
        </div>

        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_430px]">
          {/* 左侧卡通角色舞台卡片（全新升级：极光星云琉璃剧场 Aurora Spatial Glass Studio 风格背景） */}
          <section className="hidden lg:block">
            <div className="relative max-w-xl overflow-hidden rounded-[36px] border border-white/95 bg-[linear-gradient(145deg,#f8fafc_0%,#eef2ff_38%,#f5f3ff_72%,#fff7ed_100%)] p-8 shadow-[inset_0_2px_6px_rgba(255,255,255,0.98),0_28px_72px_-16px_rgba(79,70,229,0.14),0_12px_32px_-8px_rgba(234,88,12,0.08)] backdrop-blur-2xl ring-1 ring-indigo-100/80">
              {/* 建筑感空间微网格纹理 */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.38]"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(99, 102, 241, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(99, 102, 241, 0.08) 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                  maskImage:
                    "radial-gradient(ellipse 85% 75% at 50% 55%, #000 35%, transparent 100%)",
                  WebkitMaskImage:
                    "radial-gradient(ellipse 85% 75% at 50% 55%, #000 35%, transparent 100%)",
                }}
              />
              {/* 极光冷暖撞色弥散光球 */}
              <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-gradient-to-br from-sky-300/35 via-indigo-300/25 to-transparent blur-3xl" />
              <div className="pointer-events-none absolute -right-16 top-12 h-80 w-80 rounded-full bg-gradient-to-bl from-violet-300/30 via-fuchsia-200/20 to-transparent blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 left-1/4 h-64 w-80 rounded-full bg-gradient-to-t from-amber-300/35 via-orange-200/25 to-transparent blur-3xl" />

              <div className="relative">
                {/* 极简品牌微排版与背书 */}
                <div className="relative z-10 mb-6 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-white/90 px-3.5 py-1 text-xs font-bold text-slate-800 shadow-2xs backdrop-blur-md">
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                      </span>
                      <span>Jianlian Hub · 全球数字商品与网络服务</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                      开启你的数字体验
                    </h1>
                    <p className="text-sm font-medium text-slate-600 leading-relaxed">
                      安全、极速、放心的全球海外原生账户与数字化服务方案
                    </p>
                  </div>
                </div>

                {/* 卡通角色核心组件 */}
                <div className="mt-4">
                  <AnimatedCharacters
                    email={email}
                    mode={currentMode}
                    isTyping={isTyping}
                    showPassword={showPassword}
                    passwordLength={password.length}
                    loginFailed={Boolean(error)}
                    loginSuccess={loginSuccess}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 右侧表单卡片 */}
          <section className="w-full">
            <div className="mx-auto max-w-[430px] rounded-[32px] border border-white/90 bg-white/80 p-2 shadow-[0_28px_90px_rgba(15,23,42,0.14)] ring-1 ring-orange-100/60 backdrop-blur-xl">
              <div className="rounded-[26px] border border-orange-50 bg-white/90 p-6 sm:p-7">
                <div className="mb-6 flex items-center gap-3">
                  <img
                    src="/assets/jianlian-brand-logo.png"
                    alt="Jianlian"
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-2xl object-cover shadow-xs ring-1 ring-orange-200/50"
                  />
                  <div>
                    <div className="text-xl font-black leading-tight tracking-tight text-slate-900">
                      Jianlian
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-muted-foreground">
                      数字商品服务
                    </div>
                  </div>
                </div>

                {/* 增加平滑弹簧滑块指示动画的登录/注册 Tab */}
                <div className="relative mb-6 flex rounded-2xl bg-slate-100/90 p-1">
                  <div
                    className={cn(
                      "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-sm transition-transform duration-300 ease-out",
                      isRegister
                        ? "translate-x-[calc(100%+8px)]"
                        : "translate-x-0"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className={cn(
                      "relative z-10 flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold transition-colors duration-200",
                      !isRegister
                        ? "text-primary"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode("register")}
                    className={cn(
                      "relative z-10 flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold transition-colors duration-200",
                      isRegister
                        ? "text-primary"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    注册
                  </button>
                </div>

                <div className="mb-5 transition-all duration-200">
                  <h2 className="text-2xl font-black text-slate-900">
                    {isRegister ? "创建新账号" : "欢迎回来"}
                  </h2>
                </div>

                {registration ? (
                  <>
                    <EmailVerificationForm
                      email={registration.email}
                      busy={loading}
                      onVerify={verifyRegistration}
                      onResend={resendRegistrationCode}
                      onBack={() => {
                        forgetPendingSignup();
                        setRegistration(null);
                        setError("");
                        setMessage("");
                      }}
                    />
                    {error && (
                      <p
                        role="alert"
                        className="mt-3 text-sm text-red-600"
                      >
                        {error}
                      </p>
                    )}
                    {message && (
                      <p
                        role="status"
                        className="mt-3 text-sm text-emerald-700"
                      >
                        {message}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <form
                      onSubmit={handleSubmit}
                      className="space-y-4 transition-opacity duration-200"
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="email">邮箱</Label>
                        <div className="group flex h-11 w-full items-center rounded-xl border border-slate-200/90 bg-white/95 px-3.5 shadow-xs transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                          <Mail className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary mr-3" />
                          <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) => {
                              setEmail(event.target.value);
                              setIsTyping(true);
                            }}
                            onFocus={() => {
                              setIsEmailFocused(true);
                              setIsTyping(true);
                            }}
                            onBlur={() => {
                              setIsEmailFocused(false);
                              setIsTyping(false);
                            }}
                            placeholder="请输入邮箱"
                            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none border-none p-0"
                            autoComplete="email"
                            required
                          />
                        </div>
                      </div>

                      {/* 注册模式下：邮箱下方紧跟邮箱验证码（填完邮箱即可直接获取并输入验证码），验证码下方才是密码 */}
                      <div
                        className={cn(
                          "grid transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]",
                          isRegister
                            ? "grid-rows-[1fr] opacity-100 translate-y-0"
                            : "grid-rows-[0fr] opacity-0 -translate-y-1 pointer-events-none !mt-0"
                        )}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="space-y-1.5 pt-0.5 pb-0.5 px-1 -mx-1">
                            <Label htmlFor="emailOtp">邮箱验证码</Label>
                            <div className="group flex h-11 w-full items-center rounded-xl border border-slate-200/90 bg-white/95 px-3.5 shadow-xs transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary mr-3" />
                              <input
                                id="emailOtp"
                                type="text"
                                value={emailOtp}
                                onChange={(event) =>
                                  setEmailOtp(event.target.value.trim())
                                }
                                placeholder="请输入邮箱收到的验证码"
                                className="flex-1 min-w-0 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none border-none p-0"
                                maxLength={8}
                                tabIndex={isRegister ? 0 : -1}
                              />
                              <button
                                type="button"
                                onClick={handleSendRegisterOtp}
                                disabled={otpSending || otpCountdown > 0 || !email.trim()}
                                tabIndex={isRegister ? 0 : -1}
                                className="shrink-0 ml-2 rounded-lg bg-orange-100/90 px-3 py-1.5 text-xs font-semibold text-primary shadow-2xs transition-colors hover:bg-orange-200/90 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {otpSending
                                  ? "发送中..."
                                  : otpCountdown > 0
                                  ? `${otpCountdown}s 后重发`
                                  : "获取验证码"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="password">密码</Label>
                        <div className="group flex h-11 w-full items-center rounded-xl border border-slate-200/90 bg-white/95 px-3.5 shadow-xs transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                          <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary mr-3" />
                          <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(event) => {
                              setPassword(event.target.value);
                              setIsTyping(true);
                            }}
                            onFocus={() => {
                              setIsPasswordFocused(true);
                              setIsTyping(true);
                            }}
                            onBlur={() => {
                              setIsPasswordFocused(false);
                              setIsTyping(false);
                            }}
                            placeholder="请输入密码"
                            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none border-none p-0"
                            autoComplete={
                              isRegister ? "new-password" : "current-password"
                            }
                            required
                          />
                          <button
                            type="button"
                            className="shrink-0 ml-2.5 p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none cursor-pointer"
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={showPassword ? "隐藏密码" : "显示密码"}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        {/* 忘记密码移至密码右下角：使用双向平滑 Grid 高度折叠，避免登录<->注册切换时高度瞬跳 */}
                        <div
                          className={cn(
                            "grid transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]",
                            !isRegister
                              ? "grid-rows-[1fr] opacity-100 pt-0.5"
                              : "grid-rows-[0fr] opacity-0 pointer-events-none pt-0"
                          )}
                        >
                          <div className="min-h-0 overflow-hidden flex justify-end">
                            <Link
                              href="/forgot-password"
                              tabIndex={isRegister ? -1 : 0}
                              className="text-xs font-medium text-slate-500 transition-colors hover:text-primary"
                            >
                              忘记密码？
                            </Link>
                          </div>
                        </div>
                      </div>

                      {/* 密码下方的注册附加项：邀请码与用户协议 */}
                      <div
                        className={cn(
                          "grid transition-all duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]",
                          isRegister
                            ? "grid-rows-[1fr] opacity-100 translate-y-0"
                            : "grid-rows-[0fr] opacity-0 -translate-y-1 pointer-events-none !mt-0"
                        )}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="space-y-4 pt-1 pb-1 px-1 -mx-1">
                          <div className="space-y-1.5">
                            <Label htmlFor="inviteCode">邀请码（选填）</Label>
                            <div className="group flex h-11 w-full items-center rounded-xl border border-slate-200/90 bg-white/95 px-3.5 shadow-xs transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary mr-3" />
                              <input
                                id="inviteCode"
                                value={inviteCode}
                                onChange={(event) =>
                                  setInviteCode(event.target.value)
                                }
                                placeholder="请输入邀请码"
                                className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none border-none p-0"
                              />
                            </div>
                          </div>
                          <div className="flex items-start gap-3 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2.5">
                            <Checkbox
                              id="acceptedTerms"
                              checked={acceptedTerms}
                              onCheckedChange={(checked) =>
                                setAcceptedTerms(checked === true)
                              }
                              className="mt-0.5"
                            />
                            <Label
                              htmlFor="acceptedTerms"
                              className="cursor-pointer text-xs font-normal leading-5 text-slate-700"
                            >
                              我已阅读并同意
                              <Link
                                href="/terms"
                                className="mx-1 font-semibold text-primary hover:text-primary/80"
                              >
                                用户协议
                              </Link>
                              和
                              <Link
                                href="/privacy"
                                className="mx-1 font-semibold text-primary hover:text-primary/80"
                              >
                                隐私政策
                              </Link>
                            </Label>
                          </div>
                          </div>
                        </div>
                      </div>

                      {error ? (
                        <div
                          role="alert"
                          aria-live="polite"
                          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-600"
                        >
                          {error}
                        </div>
                      ) : null}

                      {message ? (
                        <div
                          role="status"
                          aria-live="polite"
                          className="rounded-xl border border-green-200 bg-green-50 px-3.5 py-2.5 text-xs text-green-700"
                        >
                          {message}
                        </div>
                      ) : null}

                      <Button
                        ref={submitBtnRef}
                        type="submit"
                        className="h-11 w-full rounded-xl text-sm font-semibold"
                        disabled={loading}
                      >
                        {loading
                          ? "处理中..."
                          : isRegister
                          ? "注册"
                          : "登录"}
                      </Button>
                    </form>

                    {/* 谷歌登录紧跟在登录主按钮正下方 */}
                    <div className="mt-3">
                      <AlternateLoginMethods
                        mode={currentMode}
                        redirectTo={
                          redirectTo === "/" ? "/account" : redirectTo
                        }
                        inviteCode={inviteCode}
                        acceptedTerms={acceptedTerms}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
