"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
  isSad?: boolean;
  sadRotate?: number;
  mouseX: number;
  mouseY: number;
}

function EyeBall({
  size = 18,
  pupilSize = 7,
  maxDistance = 5,
  eyeColor = "#FFFFFF",
  pupilColor = "#231F20",
  isBlinking = false,
  forceLookX,
  forceLookY,
  isSad = false,
  sadRotate = 0,
  mouseX,
  mouseY,
}: EyeBallProps) {
  const eyeRef = useRef<HTMLDivElement>(null);

  const pupilPos = useMemo(() => {
    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }
    if (!eyeRef.current) return { x: 0, y: 0 };
    const rect = eyeRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
    const angle = Math.atan2(dy, dx);
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
  }, [mouseX, mouseY, forceLookX, forceLookY, maxDistance]);

  return (
    <div
      ref={eyeRef}
      style={{
        width: `${size}px`,
        height: isBlinking ? "2.5px" : isSad ? `${size * 0.52}px` : `${size}px`,
        backgroundColor: eyeColor,
        borderRadius: isSad ? `0 0 ${size}px ${size}px` : "50%",
        transform: isSad ? `rotate(${sadRotate}deg)` : "rotate(0deg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.26s cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: "hidden",
        boxShadow:
          "inset 0 1.5px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)",
      }}
    >
      {!isBlinking && (
        <div
          style={{
            position: "relative",
            width: `${pupilSize}px`,
            height: `${pupilSize}px`,
            backgroundColor: pupilColor,
            borderRadius: "50%",
            transform: `translate(${pupilPos.x}px, ${isSad ? -1 : pupilPos.y}px)`,
            transition: "transform 0.32s cubic-bezier(0.25, 1, 0.5, 1)",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: "1.2px",
              right: "1.2px",
              width: `${Math.max(2, pupilSize * 0.34)}px`,
              height: `${Math.max(2, pupilSize * 0.34)}px`,
              borderRadius: "50%",
              backgroundColor: "rgba(255,255,255,0.95)",
            }}
          />
          <span
            style={{
              position: "absolute",
              bottom: "1.2px",
              left: "1.5px",
              width: `${Math.max(1.5, pupilSize * 0.2)}px`,
              height: `${Math.max(1.5, pupilSize * 0.2)}px`,
              borderRadius: "50%",
              backgroundColor: "rgba(255,255,255,0.7)",
            }}
          />
        </div>
      )}
    </div>
  );
}

interface PupilProps {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
  mouseX: number;
  mouseY: number;
}

function Pupil({
  size = 12,
  maxDistance = 5,
  pupilColor = "#231F20",
  isBlinking = false,
  forceLookX,
  forceLookY,
  mouseX,
  mouseY,
}: PupilProps) {
  const pupilRef = useRef<HTMLDivElement>(null);

  const pupilPos = useMemo(() => {
    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }
    if (!pupilRef.current) return { x: 0, y: 0 };
    const rect = pupilRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
    const angle = Math.atan2(dy, dx);
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
  }, [mouseX, mouseY, forceLookX, forceLookY, maxDistance]);

  return (
    <div
      ref={pupilRef}
      style={{
        position: "relative",
        width: `${size}px`,
        height: isBlinking ? "2.5px" : `${size}px`,
        backgroundColor: pupilColor,
        borderRadius: "50%",
        transform: `translate(${pupilPos.x}px, ${pupilPos.y}px)`,
        transition: "transform 0.32s cubic-bezier(0.25, 1, 0.5, 1), height 0.15s ease-out",
        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
      }}
    >
      {!isBlinking && (
        <>
          <span
            style={{
              position: "absolute",
              top: "2px",
              right: "2.2px",
              width: "3.2px",
              height: "3.2px",
              borderRadius: "50%",
              backgroundColor: "rgba(255,255,255,0.95)",
            }}
          />
          <span
            style={{
              position: "absolute",
              bottom: "2px",
              left: "2px",
              width: "1.8px",
              height: "1.8px",
              borderRadius: "50%",
              backgroundColor: "rgba(255,255,255,0.7)",
            }}
          />
        </>
      )}
    </div>
  );
}

export interface AnimatedCharactersProps {
  email?: string;
  mode?: "login" | "register";
  isTyping?: boolean;
  showPassword?: boolean;
  passwordLength?: number;
  loginFailed?: boolean;
  loginSuccess?: boolean;
  compact?: boolean;
}

type CharKey = "purple" | "black" | "orange" | "yellow";

const CHAR_KEYS: CharKey[] = ["purple", "black", "orange", "yellow"];

const SPEECH_LINES = {
  emailNice: [
    "哇，好靓的邮箱！✨",
    "这个邮箱一看就是大户人家~",
    "手速可以啊，键盘都要冒火星了！",
    "好名字！我已经偷偷记下来啦~",
    "这邮箱拼写看着就很尊贵！",
    "终于等到你来啦，快请进~",
    "叮咚！检测到一位高颜值用户正在输入~",
    "确认过眼神，是尊贵的 Jianlian 用户！👑",
  ],
  passwordShort: [
    "嘘…大家都别出声，正在输机密！",
    "放心输，我保证绝对不看键盘！",
    "密码正在输入中，保持严肃~",
    "一二三四五…放心，我没数你的密码！",
    "严肃点严肃点，机密录入中！",
  ],
  passwordLong: [
    "这个密码这么长，肯定很厉害吧！",
    "哇塞，这密码长度连黑客看了都摇头！",
    "这么长的密码，你真的背得下来吗？😮",
    "安全感拉满！这密码简直固若金汤~",
    "还在输？！这密码得有太平洋那么长了吧！",
    "超长防护罩启动！安全系数 100%！🛡️",
  ],
  passwordReveal: [
    "非礼勿视，非礼勿视~ 快转过去！",
    "快转头，不能看人家的密码！",
    "礼貌转头，我们可是正经小助手！",
    "哇，快捂眼，这是最高机密！",
    "我闭眼我闭眼，绝不看了！",
  ],
  passwordPeek: [
    "我就偷偷瞄一眼，应该不会被发现吧？👀",
    "哎呀偷看被抓包了！我闭眼我闭眼！🙈",
    "好奇心害死猫，让我悄悄瞄半眼~",
    "大家都转过去了，那我替大家检查下错别字~",
  ],
  loginError: [
    "哈哈哈，密码错误了！🤣",
    "哎呀，手滑输错了吧？",
    "翻车啦翻车啦，快重来一次！",
    "密码不对哦，是不是大小写搞错了？",
    "芭比Q了，密码没对上，再想想~",
    "差一点点就猜对啦，再试一次！",
    "别慌，稳住，再想想密码是啥~",
  ],
  loginSuccess: [
    "太棒啦！欢迎回来！🎉",
    "芜湖~ 验证通过，起飞！",
    "欢迎进入 Jianlian.shop！✨",
    "撒花撒花！大门已为你敞开~",
  ],
  modeSwitchRegister: [
    "哇，要有新朋友加入 Jianlian 啦！",
    "欢迎新同学！快注册个账号吧~",
    "新账号好运连连，冲鸭！✨",
  ],
  modeSwitchLogin: [
    "老朋友欢迎回来，快快请进~",
    "切回登录啦，熟门熟路！",
  ],
  idle: [
    "摸鱼没有你这么摸鱼的~",
    "偷偷看一眼，老板在不在后面？",
    "今天摸鱼指标超额完成了没？",
    "鼠标晃得我眼都花啦！😵",
    "看我干嘛，快登录呀~",
    "今天也是元气满满搬砖的一天！",
    "发什么呆呢，就等你按登录啦~",
    "你不动我不动，咱们比比谁先眨眼！",
    "脖子都看酸了，给点动静呗~",
    "喂~ 屏幕前的小伙伴还在吗？",
  ],
  poke: [
    "摸鱼没有你这么摸鱼的，还戳我！",
    "别戳啦，痒痒痒~ 😆",
    "再戳我就要收门票啦！",
    "快去登录啦，别玩我了~",
    "哎哟！被你戳得长高了一厘米~",
    "戳我干嘛，我脸上又没写密码！",
    "弹弹弹，把烦恼都弹走~ ✨",
  ],
  drag: [
    "放开我！抓到我命运的后颈皮了！😆",
    "别拽啦别拽啦，要变形了！",
    "哎呀，拉扯感太强了，好弹！✨",
    "Duang~ 果冻弹簧人变身！",
    "好弹好弹！再拽一次试试？🎉",
    "本座可是高弹性记忆海绵！",
    "咻~ 弹回去了，手感真不错！",
    "救命，要被拉成面条啦~ 🍜",
  ],
  dragPlucked: [
    "放我下来啦，吓死宝宝了！😱",
    "哇！刚刚脚底悬空了！",
    "好险好险，差点被抓走了~",
    "咻~ 安全着陆！再拔我我就要叫保安了！",
    "呼…脚踏实地的感觉真好~ ✨",
    "救命，差点被当成萝卜拔出来了！🥕",
    "我的后颈皮都要被你揪秃啦！😆",
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function StageSpeechBubble({
  text,
  bubbleKey,
  x,
  y,
}: {
  text?: string;
  bubbleKey?: number;
  x: number;
  y: number;
}) {
  if (!text) return null;
  return (
    <div
      key={bubbleKey}
      style={{
        position: "absolute",
        left: `${x}px`,
        bottom: `${y + 10}px`,
        transform: "translateX(-50%)",
        zIndex: 90,
        pointerEvents: "none",
      }}
      className="animate-[jianlian-bubble-pop_0.32s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
    >
      <div className="relative whitespace-nowrap rounded-[22px] border border-orange-200/90 bg-gradient-to-b from-white via-white to-[#fffaf5] px-4 py-2 text-[13.5px] font-bold tracking-tight text-slate-800 shadow-[0_16px_36px_-6px_rgba(180,95,30,0.22),0_4px_12px_rgba(0,0,0,0.04)] backdrop-blur-md ring-1 ring-white/80">
        {text}
        {/* 气泡小尾巴：垂直居中向下指向角色头顶 */}
        <div
          style={{
            position: "absolute",
            bottom: "-6px",
            left: "50%",
            transform: "translateX(-50%) rotate(45deg)",
            width: "12px",
            height: "12px",
            backgroundColor: "#fffaf5",
            borderRight: "1.5px solid rgba(254, 215, 170, 0.95)",
            borderBottom: "1.5px solid rgba(254, 215, 170, 0.95)",
            boxShadow: "2px 2px 4px rgba(180,95,30,0.06)",
          }}
        />
      </div>
    </div>
  );
}

export default function AnimatedCharacters({
  email = "",
  mode = "login",
  isTyping = false,
  showPassword = false,
  passwordLength = 0,
  loginFailed = false,
  loginSuccess = false,
  compact = false,
}: AnimatedCharactersProps) {
  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);

  const [mouse, setMouse] = useState({ x: 600, y: 400 });
  const [blinking, setBlinking] = useState({
    purple: false,
    black: false,
    orange: false,
    yellow: false,
  });
  const [poked, setPoked] = useState<Record<CharKey, boolean>>({
    purple: false,
    black: false,
    orange: false,
    yellow: false,
  });

  // Dedicated per-character bubbles so each character speaks natively from its own head
  const [bubbles, setBubbles] = useState<Record<CharKey, { text: string; key: number } | null>>({
    purple: null,
    black: null,
    orange: null,
    yellow: null,
  });

  // Tactile drag, pluck out ("揪出来") and elastic spring rebound state
  const [draggingChar, setDraggingChar] = useState<CharKey | null>(null);
  const [dragPhysics, setDragPhysics] = useState({
    shiftX: 0,
    liftY: 0,
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    isLifted: false,
  });
  const [droppingChar, setDroppingChar] = useState<CharKey | null>(null);
  const [dropParams, setDropParams] = useState({ lift: 0, angle: 0 });
  const [reboundingChar, setReboundingChar] = useState<CharKey | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  const [activeFailPose, setActiveFailPose] = useState(false);
  const [isShakingError, setIsShakingError] = useState(false);
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPurplePeeking, setIsPurplePeeking] = useState(false);
  const [successLookY, setSuccessLookY] = useState(-5);

  const bubbleTimerRef = useRef<Record<CharKey, ReturnType<typeof setTimeout> | null>>({
    purple: null,
    black: null,
    orange: null,
    yellow: null,
  });
  const lastSpokenEmailRef = useRef(false);
  const lastSpokenLongPwdRef = useRef(false);
  const prevModeRef = useRef(mode);

  const isHidingPassword = passwordLength > 0 && !showPassword;
  const isRevealingPassword = passwordLength > 0 && showPassword;

  const triggerBubble = useCallback(
    (text: string, preferredChar?: CharKey, duration = 3200) => {
      const char = preferredChar || pickRandom(CHAR_KEYS);
      setBubbles((prev) => ({
        ...prev,
        [char]: { text, key: Date.now() },
      }));
      if (bubbleTimerRef.current[char]) clearTimeout(bubbleTimerRef.current[char]!);
      bubbleTimerRef.current[char] = setTimeout(() => {
        setBubbles((prev) => {
          if (prev[char]?.text === text) {
            return { ...prev, [char]: null };
          }
          return prev;
        });
      }, duration);
    },
    []
  );

  // React to Login <-> Register mode switching
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode;
      setIsLookingAtEachOther(true);
      triggerBubble(
        mode === "register"
          ? pickRandom(SPEECH_LINES.modeSwitchRegister)
          : pickRandom(SPEECH_LINES.modeSwitchLogin)
      );
      const t = setTimeout(() => setIsLookingAtEachOther(false), 750);
      return () => clearTimeout(t);
    }
  }, [mode, triggerBubble]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setMouse({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    CHAR_KEYS.forEach((key) => {
      const schedule = () => {
        const t = setTimeout(() => {
          setBlinking((prev) => ({ ...prev, [key]: true }));
          const t2 = setTimeout(() => {
            setBlinking((prev) => ({ ...prev, [key]: false }));
            schedule();
          }, 150);
          timers.push(t2);
        }, Math.random() * 4000 + 2800);
        timers.push(t);
      };
      schedule();
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isTyping && passwordLength === 0 && !activeFailPose && !loginSuccess) {
        triggerBubble(pickRandom(SPEECH_LINES.idle));
      }
    }, 7500);
    return () => clearInterval(interval);
  }, [isTyping, passwordLength, activeFailPose, loginSuccess, triggerBubble]);

  useEffect(() => {
    if (email.includes("@") && email.length >= 6 && !lastSpokenEmailRef.current) {
      lastSpokenEmailRef.current = true;
      triggerBubble(pickRandom(SPEECH_LINES.emailNice));
    } else if (email.length === 0) {
      lastSpokenEmailRef.current = false;
    }
  }, [email, triggerBubble]);

  useEffect(() => {
    if (passwordLength === 2) {
      triggerBubble(pickRandom(SPEECH_LINES.passwordShort));
    } else if (passwordLength >= 9 && !lastSpokenLongPwdRef.current) {
      lastSpokenLongPwdRef.current = true;
      triggerBubble(pickRandom(SPEECH_LINES.passwordLong));
    } else if (passwordLength < 5) {
      lastSpokenLongPwdRef.current = false;
    }
  }, [passwordLength, triggerBubble]);

  useEffect(() => {
    if (showPassword && passwordLength > 0) {
      triggerBubble(
        pickRandom(SPEECH_LINES.passwordReveal),
        pickRandom(["black", "orange", "yellow"])
      );
    }
  }, [showPassword, passwordLength, triggerBubble]);


  useEffect(() => {
    if (passwordLength > 0 && showPassword && !activeFailPose && !loginSuccess) {
      const interval = setInterval(() => {
        setIsPurplePeeking(true);
        triggerBubble(pickRandom(SPEECH_LINES.passwordPeek), "purple", 2300);
        setTimeout(() => setIsPurplePeeking(false), 950);
      }, 3600);
      return () => clearInterval(interval);
    } else {
      setIsPurplePeeking(false);
    }
  }, [passwordLength, showPassword, activeFailPose, loginSuccess, triggerBubble]);

  useEffect(() => {
    if (loginFailed) {
      setActiveFailPose(true);
      setIsShakingError(true);
      triggerBubble(pickRandom(SPEECH_LINES.loginError), undefined, 3000);

      const shakeTimer = setTimeout(() => {
        setIsShakingError(false);
      }, 650);

      const recoverTimer = setTimeout(() => {
        setActiveFailPose(false);
      }, 3000);

      return () => {
        clearTimeout(shakeTimer);
        clearTimeout(recoverTimer);
      };
    } else {
      setActiveFailPose(false);
      setIsShakingError(false);
    }
  }, [loginFailed, triggerBubble]);

  useEffect(() => {
    if (!loginSuccess) {
      setSuccessLookY(-5);
      return;
    }
    triggerBubble(pickRandom(SPEECH_LINES.loginSuccess), "orange", 4500);
    let rafId: number;
    const startTime = performance.now();
    const duration = 5000;
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      setSuccessLookY(-5 + 9 * eased);
      if (progress < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [loginSuccess, triggerBubble]);

  const handlePoke = (char: CharKey) => {
    setPoked((prev) => ({ ...prev, [char]: true }));
    setTimeout(() => {
      setPoked((prev) => ({ ...prev, [char]: false }));
    }, 280);
    triggerBubble(pickRandom(SPEECH_LINES.poke), char, 2600);
  };

  // 保持对最新拖拽物理状态的引用，用于全局原生事件与输入看门狗
  const draggingCharRef = useRef<CharKey | null>(null);
  const dragPhysicsRef = useRef(dragPhysics);
  dragPhysicsRef.current = dragPhysics;
  draggingCharRef.current = draggingChar;

  const handlePointerDown = (char: CharKey, e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
    setDraggingChar(char);
    draggingCharRef.current = char;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    hasDraggedRef.current = false;
    setDragPhysics({
      shiftX: 0,
      liftY: 0,
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      isLifted: false,
    });
  };

  const endDragGracefully = useCallback(() => {
    const char = draggingCharRef.current;
    if (!char) return;
    const wasDragged = hasDraggedRef.current;
    const { liftY, angle, isLifted } = dragPhysicsRef.current;

    setDraggingChar(null);
    draggingCharRef.current = null;
    setDragPhysics({
      shiftX: 0,
      liftY: 0,
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      isLifted: false,
    });

    if (wasDragged) {
      if (isLifted && liftY > 16) {
        // Was plucked in the air! Trigger drop & landing animation
        setDropParams({ lift: liftY, angle });
        setDroppingChar(char);
        setTimeout(() => setDroppingChar(null), 650);
        triggerBubble(pickRandom(SPEECH_LINES.dragPlucked), char, 3000);
      } else {
        // Rebound
        setReboundingChar(char);
        setTimeout(() => setReboundingChar(null), 650);
        triggerBubble(pickRandom(SPEECH_LINES.drag), char, 2800);
      }
    } else {
      handlePoke(char);
    }
  }, [triggerBubble]);

  // 全局指针事件：无论鼠标移动到右侧表单、屏幕任何地方或窗口外，均 100% 捕获并平滑释放落地！
  useEffect(() => {
    if (!draggingChar) return;

    const onPointerMoveGlobal = (e: PointerEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 4) {
        hasDraggedRef.current = true;
      }

      if (dy < 0) {
        // Dragging UP
        const pullUpDist = -dy;
        if (pullUpDist <= 28) {
          setDragPhysics({
            shiftX: Math.max(-60, Math.min(60, dx * 0.6)),
            liftY: 0,
            angle: Math.max(-14, Math.min(14, dx * 0.18)),
            scaleX: 1 - pullUpDist * 0.0035,
            scaleY: 1 + pullUpDist * 0.007,
            isLifted: false,
          });
        } else {
          // Plucked out! ("揪出来！" 拔地而起 离地悬空)
          const excess = pullUpDist - 28;
          setDragPhysics({
            shiftX: Math.max(-85, Math.min(85, dx * 0.75)),
            liftY: Math.min(110, excess * 0.72),
            angle: Math.max(-22, Math.min(22, dx * 0.22)),
            scaleX: 0.91,
            scaleY: 1.12 + Math.min(0.16, excess * 0.002),
            isLifted: true,
          });
        }
      } else {
        // Dragging DOWN: squashes into the floor，自然微膨胀，绝不切断底角
        setDragPhysics({
          shiftX: Math.max(-45, Math.min(45, dx * 0.5)),
          liftY: 0,
          angle: Math.max(-10, Math.min(10, dx * 0.15)),
          scaleX: 1 + Math.min(0.22, dy * 0.003),
          scaleY: 1 - Math.min(0.2, dy * 0.0028),
          isLifted: false,
        });
      }
    };

    const onPointerUpGlobal = () => {
      endDragGracefully();
    };

    window.addEventListener("pointermove", onPointerMoveGlobal);
    window.addEventListener("pointerup", onPointerUpGlobal);
    window.addEventListener("pointercancel", onPointerUpGlobal);
    window.addEventListener("blur", onPointerUpGlobal);

    return () => {
      window.removeEventListener("pointermove", onPointerMoveGlobal);
      window.removeEventListener("pointerup", onPointerUpGlobal);
      window.removeEventListener("pointercancel", onPointerUpGlobal);
      window.removeEventListener("blur", onPointerUpGlobal);
    };
  }, [draggingChar, endDragGracefully]);

  // 全局强力看门狗：当用户在右侧开始输入表单（isTyping、输入密码或邮箱）时，如果角色处于浮空或拖拽，立即无条件强制软着陆落地，彻底杜绝浮空卡死！
  useEffect(() => {
    if (
      (isTyping || passwordLength > 0) &&
      (draggingCharRef.current || draggingChar || dragPhysics.liftY > 0)
    ) {
      endDragGracefully();
    }
  }, [isTyping, passwordLength, draggingChar, dragPhysics.liftY, endDragGracefully]);

  const getCharTransform = (char: CharKey, baseTransform: string) => {
    if (draggingChar === char) {
      const { shiftX, liftY, angle, scaleX, scaleY } = dragPhysics;
      return `translateX(${shiftX}px) translateY(${-liftY}px) rotate(${angle}deg) scale(${scaleX}, ${scaleY})`;
    }
    if (droppingChar === char) {
      return "none";
    }
    return baseTransform;
  };

  const calcPos = (
    el: HTMLDivElement | null,
    rangeX = 15,
    rangeY = 10,
    minX: number | null = null,
    maxX: number | null = null,
    minY: number | null = null,
    maxY: number | null = null,
    centerRatioY = 1 / 3
  ) => {
    if (!el) return { faceX: 0, faceY: 0, bodySkew: 0 };
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * centerRatioY;
    const rMinX = minX !== null ? minX : -rangeX;
    const rMaxX = maxX !== null ? maxX : rangeX;
    const rMinY = minY !== null ? minY : -rangeY;
    const rMaxY = maxY !== null ? maxY : rangeY;
    const dx = mouse.x - cx;
    const dy = mouse.y - cy;
    const scaleX = Math.max(Math.abs(rMinX), Math.abs(rMaxX));
    const scaleY = Math.max(Math.abs(rMinY), Math.abs(rMaxY));
    return {
      faceX: Math.max(rMinX, Math.min(rMaxX, dx / (300 / scaleX))),
      faceY: Math.max(rMinY, Math.min(rMaxY, dy / (300 / scaleY))),
      bodySkew: Math.max(-6, Math.min(6, -dx / 120)),
    };
  };

  const purplePos = calcPos(purpleRef.current, 0, 0, -46, 18, -8, 5);
  const blackPos = calcPos(blackRef.current);
  // Enhanced, symmetrical and snappy mouse tracking for bottom-left orange character
  const orangePos = calcPos(orangeRef.current, 0, 0, -38, 38, -24, 20, 0.45);
  const yellowPos = calcPos(yellowRef.current);

  const purpleHeight = activeFailPose ? 365 : isTyping ? 430 : 400;
  const blackHeight = activeFailPose ? 284 : 312;
  const orangeHeight = activeFailPose ? 135 : 154;
  const yellowHeight = activeFailPose ? 210 : 232;

  // 气泡动态锚定角色头顶坐标计算（彻底解决倾斜/躲避时气泡脱节漂浮的问题）
  const purpleEffectiveSkew = poked.purple
    ? 0
    : activeFailPose
      ? -8
      : isRevealingPassword
        ? 0
        : isTyping
          ? (purplePos.bodySkew || 0) - 10
          : (purplePos.bodySkew || 0);
  const purpleEffectiveTranslateX =
    isTyping && !activeFailPose && !isRevealingPassword && !poked.purple
      ? 32
      : 0;
  const purpleHeadX = Math.round(
    160 +
      purpleEffectiveTranslateX -
      Math.tan((purpleEffectiveSkew * Math.PI) / 180) * purpleHeight +
      (draggingChar === "purple" ? dragPhysics.shiftX : 0)
  );
  const purpleHeadY = Math.round(
    purpleHeight + (draggingChar === "purple" ? dragPhysics.liftY : 0) + 14
  );

  const blackEffectiveSkew = poked.black
    ? 0
    : activeFailPose
      ? 7
      : isRevealingPassword
        ? 0
        : isTyping
          ? (blackPos.bodySkew || 0) * 1.5 + 8
          : (blackPos.bodySkew || 0);
  const blackEffectiveTranslateX =
    isTyping && !activeFailPose && !isRevealingPassword && !poked.black
      ? 16
      : 0;
  const blackHeadX = Math.round(
    301 +
      blackEffectiveTranslateX -
      Math.tan((blackEffectiveSkew * Math.PI) / 180) * blackHeight +
      (draggingChar === "black" ? dragPhysics.shiftX : 0)
  );
  const blackHeadY = Math.round(
    blackHeight + (draggingChar === "black" ? dragPhysics.liftY : 0) + 14
  );

  const orangeEffectiveSkew = poked.orange
    ? 0
    : activeFailPose
      ? -5
      : isRevealingPassword
        ? 0
        : (orangePos.bodySkew || 0);
  const orangeHeadX = Math.round(
    121 -
      Math.tan((orangeEffectiveSkew * Math.PI) / 180) * orangeHeight +
      (draggingChar === "orange" ? dragPhysics.shiftX : 0)
  );
  const orangeHeadY = Math.round(
    orangeHeight + (draggingChar === "orange" ? dragPhysics.liftY : 0) + 14
  );

  const yellowEffectiveSkew = poked.yellow
    ? 0
    : activeFailPose
      ? 8
      : isRevealingPassword
        ? 0
        : (yellowPos.bodySkew || 0);
  const yellowHeadX = Math.round(
    381 -
      Math.tan((yellowEffectiveSkew * Math.PI) / 180) * yellowHeight +
      (draggingChar === "yellow" ? dragPhysics.shiftX : 0)
  );
  const yellowHeadY = Math.round(
    yellowHeight + (draggingChar === "yellow" ? dragPhysics.liftY : 0) + 14
  );

  // 触感按压、悬空、拖拽与落地弹跳全链路状态判定
  const isPurpleActive = draggingChar === "purple" || droppingChar === "purple" || poked.purple;
  const isBlackActive = draggingChar === "black" || droppingChar === "black" || poked.black;
  const isOrangeActive = draggingChar === "orange" || droppingChar === "orange" || poked.orange;
  const isYellowActive = draggingChar === "yellow" || droppingChar === "yellow" || poked.yellow;

  // 饱满全圆角胶囊体：按压、空中、弹跳时100%圆弧胶囊；静止时为大圆弧底角，绝对消灭平直横线！
  const purpleBottomRadius = isPurpleActive ? 32 : 24;
  const blackBottomRadius = isBlackActive ? 28 : 22;
  const orangeBottomRadius = isOrangeActive ? 75 : 45;
  const yellowBottomRadius = isYellowActive ? 72 : 44;

  // Real-time expression gaze: 仅在用户输入账号或密码（isTyping）时柔和向右看，输入完成后恢复平滑跟随
  const isLookingRight = isTyping && !activeFailPose && !loginSuccess;

  const pForceX = activeFailPose
    ? 0
    : loginSuccess
      ? 0
      : isRevealingPassword
        ? (isPurplePeeking ? 4 : -4)
        : isLookingRight
          ? 5
          : draggingChar === "purple"
            ? 0
            : draggingChar === "orange"
              ? -4
              : draggingChar === "black"
                ? 4
                : draggingChar === "yellow"
                  ? 5
                  : undefined;

  const pForceY = activeFailPose
    ? 4
    : loginSuccess
      ? successLookY
      : isRevealingPassword
        ? (isPurplePeeking ? 5 : -4)
        : isLookingRight
          ? 1
          : draggingChar === "purple"
            ? 5 // looking down at the high altitude floor
            : draggingChar === "orange"
              ? 4
              : draggingChar === "black"
                ? -2
                : draggingChar === "yellow"
                  ? -2
                  : undefined;

  const bForceX = activeFailPose
    ? 0
    : loginSuccess
      ? 0
      : isRevealingPassword
        ? -4
        : isLookingRight
          ? 4
          : draggingChar === "black"
            ? 0
            : draggingChar === "purple"
              ? -4
              : draggingChar === "orange"
                ? -4
                : draggingChar === "yellow"
                  ? 4
                  : undefined;

  const bForceY = activeFailPose
    ? 3
    : loginSuccess
      ? successLookY
      : isRevealingPassword
        ? -4
        : isLookingRight
          ? 1
          : draggingChar === "black"
            ? 4
            : draggingChar === "purple"
              ? -5 // looking UP at dangling purple!
              : draggingChar === "orange"
                ? 4
                : draggingChar === "yellow"
                  ? -2
                  : undefined;

  const oForceX = activeFailPose
    ? 0
    : loginSuccess
      ? 0
      : isRevealingPassword
        ? -5
        : isLookingRight
          ? 5
          : draggingChar === "orange"
            ? 0
            : draggingChar === "purple"
              ? 4 // looking UP and right at purple!
              : draggingChar === "black"
                ? 4
                : draggingChar === "yellow"
                  ? 5
                  : undefined;

  const oForceY = activeFailPose
    ? 4
    : loginSuccess
      ? successLookY
      : isRevealingPassword
        ? -4
        : isLookingRight
          ? 1
          : draggingChar === "orange"
            ? 4
            : draggingChar === "purple"
              ? -5 // looking UP at purple!
              : draggingChar === "black"
                ? -4
                : draggingChar === "yellow"
                  ? -3
                  : undefined;

  const yForceX = isRevealingPassword
    ? -4
    : isLookingRight
      ? 5
      : draggingChar === "yellow"
        ? 0
        : draggingChar === "purple"
          ? -5
          : draggingChar === "black"
            ? -4
            : draggingChar === "orange"
              ? -5
              : undefined;

  const yForceY = isRevealingPassword
    ? -4
    : isLookingRight
      ? 1
      : draggingChar === "yellow"
        ? 4
        : draggingChar === "purple"
          ? -5
          : draggingChar === "black"
            ? -2
            : draggingChar === "orange"
              ? 3
              : undefined;

  return (
    <div
      className="relative flex w-full items-end justify-center select-none"
      style={{
        height: compact ? "185px" : "430px",
      }}
    >
      <style jsx>{`
        @keyframes jianlian-error-shake {
          0%,
          100% {
            transform: translateX(0);
          }
          18% {
            transform: translateX(-15px) rotate(-2deg);
          }
          36% {
            transform: translateX(14px) rotate(2deg);
          }
          54% {
            transform: translateX(-10px) rotate(-1.5deg);
          }
          72% {
            transform: translateX(9px) rotate(1.5deg);
          }
          88% {
            transform: translateX(-4px);
          }
        }
        @keyframes jianlian-bubble-pop {
          0% {
            opacity: 0;
            transform: translate(-50%, 12px) scale(0.78);
          }
          65% {
            opacity: 1;
            transform: translate(-50%, -2px) scale(1.04);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
          }
        }
        @keyframes jianlian-jelly-rebound {
          0% {
            transform: scale(1.18, 0.82);
          }
          25% {
            transform: scale(0.84, 1.18);
          }
          50% {
            transform: scale(1.09, 0.93);
          }
          75% {
            transform: scale(0.97, 1.03);
          }
          100% {
            transform: scale(1, 1);
          }
        }
        @keyframes jianlian-drop-land {
          0% {
            transform: translateY(calc(var(--drop-lift, 60) * -1px)) rotate(calc(var(--drop-angle, 0) * 1deg)) scale(0.92, 1.15);
          }
          40% {
            transform: translateY(0px) rotate(0deg) scale(1.22, 0.78);
          }
          68% {
            transform: translateY(-14px) rotate(0deg) scale(0.94, 1.08);
          }
          85% {
            transform: translateY(2px) scale(1.04, 0.97);
          }
          100% {
            transform: translateY(0px) scale(1, 1);
          }
        }
      `}</style>

      <div
        className="relative origin-bottom"
        style={{
          width: "520px",
          height: "460px",
          transform: compact ? "scale(0.41)" : "scale(0.88)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            animation: isShakingError
              ? "jianlian-error-shake 0.62s cubic-bezier(0.36, 0.07, 0.19, 0.97) both"
              : "none",
            /* 舞台基底裁切：上方与左右允许大范围跳起与气泡展开，下方严格在底座 0px 处切齐，100% 杜绝倾斜穿模露角 */
            clipPath: "inset(-260px -220px 0px -220px)",
          }}
        >
          {/* 角色立体浮岛展台（Podium Stage）：小人们稳稳站立于展台，彻底消灭生硬悬浮或切断感 */}
          <div
            style={{
              position: "absolute",
              bottom: "-4px",
              left: "15px",
              width: "480px",
              height: "26px",
              borderRadius: "50%",
              background:
                "radial-gradient(ellipse at center, rgba(235, 115, 30, 0.22) 0%, rgba(254, 215, 170, 0.14) 48%, transparent 75%)",
              filter: "blur(5px)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
          {/* Ground Shadows for Plucked / Lifted Characters */}
          {draggingChar === "purple" && dragPhysics.liftY > 4 && (
            <div
              style={{
                position: "absolute",
                bottom: "-4px",
                left: `${70 + 25 + dragPhysics.shiftX * 0.25}px`,
                width: "130px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: "rgba(88, 43, 224, 0.28)",
                filter: "blur(4px)",
                transform: `scale(${Math.max(0.45, 1 - dragPhysics.liftY * 0.005)})`,
                opacity: Math.max(0.15, 0.6 - dragPhysics.liftY * 0.003),
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          )}
          {draggingChar === "black" && dragPhysics.liftY > 4 && (
            <div
              style={{
                position: "absolute",
                bottom: "-4px",
                left: `${240 + 16 + dragPhysics.shiftX * 0.25}px`,
                width: "90px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: "rgba(0, 0, 0, 0.25)",
                filter: "blur(4px)",
                transform: `scale(${Math.max(0.45, 1 - dragPhysics.liftY * 0.005)})`,
                opacity: Math.max(0.15, 0.6 - dragPhysics.liftY * 0.003),
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          )}
          {draggingChar === "orange" && dragPhysics.liftY > 4 && (
            <div
              style={{
                position: "absolute",
                bottom: "-4px",
                left: `${0 + 40 + dragPhysics.shiftX * 0.25}px`,
                width: "160px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: "rgba(240, 121, 60, 0.28)",
                filter: "blur(4px)",
                transform: `scale(${Math.max(0.45, 1 - dragPhysics.liftY * 0.005)})`,
                opacity: Math.max(0.15, 0.6 - dragPhysics.liftY * 0.003),
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          )}
          {draggingChar === "yellow" && dragPhysics.liftY > 4 && (
            <div
              style={{
                position: "absolute",
                bottom: "-4px",
                left: `${310 + 20 + dragPhysics.shiftX * 0.25}px`,
                width: "102px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: "rgba(223, 198, 54, 0.3)",
                filter: "blur(4px)",
                transform: `scale(${Math.max(0.45, 1 - dragPhysics.liftY * 0.005)})`,
                opacity: Math.max(0.15, 0.6 - dragPhysics.liftY * 0.003),
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          )}

          {/* 1. Purple Tall Character (Beautified Soft 3D Vinyl Texture) */}
          <div
            ref={purpleRef}
            onPointerDown={(e) => handlePointerDown("purple", e)}
            className="cursor-grab active:cursor-grabbing select-none touch-none"
            style={{
              position: "absolute",
              bottom: 0,
              left: "70px",
              width: "180px",
              height: `${purpleHeight}px`,
              background:
                "linear-gradient(165deg, #8257FF 0%, #6C3FF5 52%, #582BE0 100%)",
              borderRadius: `24px 24px ${purpleBottomRadius}px ${purpleBottomRadius}px`,
              boxShadow:
                "inset 0 4px 10px rgba(255,255,255,0.34), inset -6px 0 14px rgba(45,14,130,0.22), 0 -4px 24px rgba(108,63,245,0.18)",
              zIndex: 1,
              transformOrigin:
                draggingChar === "purple" && dragPhysics.liftY > 0
                  ? "center center"
                  : "bottom center",
              transition: draggingChar === "purple" ? "none" : "all 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)",
              transform: getCharTransform(
                "purple",
                poked.purple
                  ? "scaleY(0.96) scaleX(1.03)"
                  : activeFailPose
                    ? "skewX(-8deg) scaleY(0.94)"
                    : isRevealingPassword
                      ? "skewX(0deg)"
                      : isTyping
                        ? `skewX(${(purplePos.bodySkew || 0) - 10}deg) translateX(32px)`
                        : `skewX(${purplePos.bodySkew || 0}deg)`
              ),
              animation: droppingChar === "purple"
                ? "jianlian-drop-land 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) both"
                : reboundingChar === "purple"
                  ? "jianlian-jelly-rebound 0.65s cubic-bezier(0.36, 0.07, 0.19, 0.97)"
                  : "none",
              ["--drop-lift" as string]: dropParams.lift,
              ["--drop-angle" as string]: dropParams.angle,
            }}
          >
            {/* Eyes */}
            <div
              style={{
                position: "absolute",
                display: "flex",
                gap: "32px",
                left: isRevealingPassword
                  ? "50px"
                  : isLookingAtEachOther
                    ? "85px"
                    : `${75 + purplePos.faceX}px`,
                top: activeFailPose
                  ? "42px"
                  : isRevealingPassword
                    ? "22px"
                    : isLookingAtEachOther
                      ? "50px"
                      : `${27 + purplePos.faceY}px`,
                transition: "all 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <EyeBall
                size={19}
                pupilSize={7.5}
                maxDistance={5}
                isBlinking={blinking.purple}
                isSad={activeFailPose}
                sadRotate={-15}
                mouseX={mouse.x}
                mouseY={mouse.y}
                forceLookX={pForceX}
                forceLookY={pForceY}
              />
              <EyeBall
                size={19}
                pupilSize={7.5}
                maxDistance={5}
                isBlinking={blinking.purple}
                isSad={activeFailPose}
                sadRotate={15}
                mouseX={mouse.x}
                mouseY={mouse.y}
                forceLookX={pForceX}
                forceLookY={pForceY}
              />
            </div>

            {/* Soft Blush Cheeks */}
            <div
              style={{
                position: "absolute",
                display: "flex",
                gap: "56px",
                left: isRevealingPassword
                  ? "41px"
                  : isLookingAtEachOther
                    ? "76px"
                    : `${66 + purplePos.faceX}px`,
                top: activeFailPose
                  ? "63px"
                  : isRevealingPassword
                    ? "44px"
                    : isLookingAtEachOther
                      ? "72px"
                      : `${48 + purplePos.faceY}px`,
                opacity: activeFailPose
                  ? 0.15
                  : draggingChar === "purple" && dragPhysics.isLifted
                    ? 0.85
                    : 0.45,
                pointerEvents: "none",
                transition: "all 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <div className="h-2.5 w-4 rounded-full bg-pink-300 blur-[1.5px]" />
              <div className="h-2.5 w-4 rounded-full bg-pink-300 blur-[1.5px]" />
            </div>

            {/* Purple Mouth */}
            <div
              style={{
                position: "absolute",
                backgroundColor: "#231F20",
                left: isRevealingPassword
                  ? "72px"
                  : isLookingAtEachOther
                    ? "106px"
                    : `${97 + purplePos.faceX}px`,
                top: activeFailPose
                  ? "74px"
                  : isRevealingPassword
                    ? "57px"
                    : isLookingAtEachOther
                      ? "82px"
                      : `${58 + purplePos.faceY}px`,
                width:
                  draggingChar === "purple" && dragPhysics.isLifted
                    ? "18px"
                    : loginSuccess
                      ? "28px"
                      : isTyping && !activeFailPose
                        ? "8px"
                        : "22px",
                height:
                  draggingChar === "purple" && dragPhysics.isLifted
                    ? "18px"
                    : loginSuccess
                      ? "14px"
                      : isTyping && !activeFailPose
                        ? "26px"
                        : "8px",
                borderRadius:
                  draggingChar === "purple" && dragPhysics.isLifted
                    ? "50%"
                    : activeFailPose
                      ? "12px 12px 0 0"
                      : loginSuccess
                        ? "0 0 14px 14px"
                        : isTyping
                          ? "4px"
                          : "0 0 11px 11px",
                transform:
                  draggingChar === "purple" && dragPhysics.isLifted
                    ? "translateX(2px)"
                    : isTyping &&
                      !activeFailPose &&
                      !loginSuccess &&
                      !poked.purple
                      ? `translateX(13.5px) translateY(-26px) skewX(${-((purplePos.bodySkew || 0) - 10)}deg)`
                      : "none",
                transition: "all 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          </div>

          {/* 2. Black Tall Character (Beautified Soft Matte Charcoal) */}
          <div
            ref={blackRef}
            onPointerDown={(e) => handlePointerDown("black", e)}
            className="cursor-grab active:cursor-grabbing select-none touch-none"
            style={{
              position: "absolute",
              bottom: 0,
              left: "240px",
              width: "122px",
              height: `${blackHeight}px`,
              background:
                "linear-gradient(165deg, #3D3938 0%, #282524 55%, #1A1817 100%)",
              borderRadius: `22px 22px ${blackBottomRadius}px ${blackBottomRadius}px`,
              boxShadow:
                "inset 0 3px 8px rgba(255,255,255,0.18), inset -5px 0 12px rgba(0,0,0,0.35), -4px 0 20px rgba(0,0,0,0.16)",
              zIndex: 2,
              transformOrigin:
                draggingChar === "black" && dragPhysics.liftY > 0
                  ? "center center"
                  : "bottom center",
              transition: draggingChar === "black" ? "none" : "all 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)",
              transform: getCharTransform(
                "black",
                poked.black
                  ? "scaleY(0.96) scaleX(1.03)"
                  : activeFailPose
                    ? "skewX(7deg) scaleY(0.94)"
                    : isRevealingPassword
                      ? "skewX(0deg)"
                      : isTyping
                        ? `skewX(${(blackPos.bodySkew || 0) * 1.5 + 8}deg) translateX(16px)`
                        : `skewX(${blackPos.bodySkew || 0}deg)`
              ),
              animation: droppingChar === "black"
                ? "jianlian-drop-land 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) both"
                : reboundingChar === "black"
                  ? "jianlian-jelly-rebound 0.65s cubic-bezier(0.36, 0.07, 0.19, 0.97)"
                  : "none",
              ["--drop-lift" as string]: dropParams.lift,
              ["--drop-angle" as string]: dropParams.angle,
            }}
          >
            <div
              style={{
                position: "absolute",
                display: "flex",
                gap: "24px",
                left: isRevealingPassword
                  ? "10px"
                  : isLookingAtEachOther
                    ? "32px"
                    : `${26 + blackPos.faceX}px`,
                top: activeFailPose
                  ? "46px"
                  : isRevealingPassword
                    ? "28px"
                    : isLookingAtEachOther
                      ? "14px"
                      : `${32 + blackPos.faceY}px`,
                transition: "all 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <EyeBall
                size={17}
                pupilSize={6.5}
                maxDistance={4}
                isBlinking={blinking.black}
                isSad={activeFailPose}
                sadRotate={-20}
                mouseX={mouse.x}
                mouseY={mouse.y}
                forceLookX={bForceX}
                forceLookY={bForceY}
              />
              <EyeBall
                size={17}
                pupilSize={6.5}
                maxDistance={4}
                isBlinking={blinking.black}
                isSad={activeFailPose}
                sadRotate={20}
                mouseX={mouse.x}
                mouseY={mouse.y}
                forceLookX={bForceX}
                forceLookY={bForceY}
              />
            </div>
          </div>

          {/* 3. Orange Semi-Circle Character (Beautified Warm Coral & Crystal Clear Eyeballs) */}
          <div
            ref={orangeRef}
            onPointerDown={(e) => handlePointerDown("orange", e)}
            className="cursor-grab active:cursor-grabbing select-none touch-none"
            style={{
              position: "absolute",
              bottom: 0,
              left: "0px",
              width: "242px",
              height: `${orangeHeight}px`,
              background:
                "linear-gradient(168deg, #FFAD82 0%, #FF935C 50%, #F0793C 100%)",
              borderRadius: `125px 125px ${orangeBottomRadius}px ${orangeBottomRadius}px`,
              boxShadow:
                "inset 0 4px 12px rgba(255,255,255,0.42), inset -6px 0 14px rgba(180,65,15,0.18), 0 -4px 20px rgba(240,121,60,0.2)",
              zIndex: 3,
              transformOrigin:
                draggingChar === "orange" && dragPhysics.liftY > 0
                  ? "center center"
                  : "bottom center",
              transition: draggingChar === "orange" ? "none" : "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
              transform: getCharTransform(
                "orange",
                poked.orange
                  ? "scaleY(0.96) scaleX(1.03)"
                  : activeFailPose
                    ? "scaleY(0.92) scaleX(1.04) skewX(-5deg)"
                    : isRevealingPassword
                      ? "skewX(0deg)"
                      : `skewX(${orangePos.bodySkew || 0}deg)`
              ),
              animation: droppingChar === "orange"
                ? "jianlian-drop-land 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) both"
                : reboundingChar === "orange"
                  ? "jianlian-jelly-rebound 0.65s cubic-bezier(0.36, 0.07, 0.19, 0.97)"
                  : "none",
              ["--drop-lift" as string]: dropParams.lift,
              ["--drop-angle" as string]: dropParams.angle,
            }}
          >
            {/* Orange Face: 眼睛与嘴巴完全组合为单一刚体面部，100% 杜绝眼嘴错位与滞后 */}
            <div
              className="orange-face"
              style={{
                position: "absolute",
                left: isRevealingPassword ? "80px" : "108px",
                top: activeFailPose
                  ? "68px"
                  : isRevealingPassword
                    ? "55px"
                    : "58px",
                transform: isRevealingPassword
                  ? "none"
                  : `translate(${orangePos.faceX}px, ${orangePos.faceY}px)`,
                transition:
                  draggingChar === "orange"
                    ? "none"
                    : "transform 0.14s ease-out, left 0.4s ease-out, top 0.4s ease-out",
                width: "68px",
                height: "56px",
                pointerEvents: "none",
              }}
            >
              {/* Eyes */}
              <div
                style={{
                  position: "absolute",
                  display: "flex",
                  gap: "34px",
                  left: "0px",
                  top: "0px",
                }}
              >
                <EyeBall
                  size={16.5}
                  pupilSize={7.5}
                  maxDistance={5.5}
                  isBlinking={blinking.orange}
                  isSad={activeFailPose}
                  sadRotate={-15}
                  mouseX={mouse.x}
                  mouseY={mouse.y}
                  forceLookX={oForceX}
                  forceLookY={oForceY}
                />
                <EyeBall
                  size={16.5}
                  pupilSize={7.5}
                  maxDistance={5.5}
                  isBlinking={blinking.orange}
                  isSad={activeFailPose}
                  sadRotate={15}
                  mouseX={mouse.x}
                  mouseY={mouse.y}
                  forceLookX={oForceX}
                  forceLookY={oForceY}
                />
              </div>

              {/* Cute Rosy Blush on Orange */}
              <div
                style={{
                  position: "absolute",
                  display: "flex",
                  gap: "54px",
                  left: "-12px",
                  top: "18px",
                  opacity: activeFailPose ? 0.2 : 0.6,
                }}
              >
                <div className="h-2.5 w-4 rounded-full bg-rose-500/55 blur-[1.5px]" />
                <div className="h-2.5 w-4 rounded-full bg-rose-500/55 blur-[1.5px]" />
              </div>

              {/* Orange Mouth: 位于眼睛正下方，完全随面部整体同步运动 */}
              <div
                style={{
                  position: "absolute",
                  backgroundColor: "#231F20",
                  left: "22px",
                  top: "32px",
                  width:
                    (draggingChar === "orange" || draggingChar === "purple") && dragPhysics.isLifted
                      ? "14px"
                      : loginSuccess
                        ? "28px"
                        : isTyping && !activeFailPose
                          ? "12px"
                          : "22px",
                  height:
                    (draggingChar === "orange" || draggingChar === "purple") && dragPhysics.isLifted
                      ? "14px"
                      : loginSuccess
                        ? "14px"
                        : isTyping && !activeFailPose
                          ? "12px"
                          : "10px",
                  borderRadius:
                    (draggingChar === "orange" || draggingChar === "purple") && dragPhysics.isLifted
                      ? "50%"
                      : activeFailPose
                        ? "10px 10px 0 0"
                        : loginSuccess
                          ? "0 0 14px 14px"
                          : isTyping
                            ? "50%"
                            : "0 0 11px 11px",
                  transform: "none",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </div>
          </div>

          {/* 4. Yellow Rounded Character (Beautified Warm Golden Pill) */}
          <div
            ref={yellowRef}
            onPointerDown={(e) => handlePointerDown("yellow", e)}
            className="cursor-grab active:cursor-grabbing select-none touch-none"
            style={{
              position: "absolute",
              bottom: 0,
              left: "310px",
              width: "142px",
              height: `${yellowHeight}px`,
              background:
                "linear-gradient(165deg, #F7E868 0%, #EDD94C 55%, #DFC636 100%)",
              borderRadius: `72px 72px ${yellowBottomRadius}px ${yellowBottomRadius}px`,
              boxShadow:
                "inset 0 4px 10px rgba(255,255,255,0.48), inset -6px 0 14px rgba(170,135,10,0.2), -4px 0 18px rgba(0,0,0,0.1)",
              zIndex: 4,
              transformOrigin:
                draggingChar === "yellow" && dragPhysics.liftY > 0
                  ? "center center"
                  : "bottom center",
              transition: draggingChar === "yellow" ? "none" : "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
              transform: getCharTransform(
                "yellow",
                poked.yellow
                  ? "scaleY(0.96) scaleX(1.03)"
                  : activeFailPose
                    ? "skewX(8deg) scaleY(0.93)"
                    : isRevealingPassword
                      ? "skewX(0deg)"
                      : `skewX(${yellowPos.bodySkew || 0}deg)`
              ),
              animation: droppingChar === "yellow"
                ? "jianlian-drop-land 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) both"
                : reboundingChar === "yellow"
                  ? "jianlian-jelly-rebound 0.65s cubic-bezier(0.36, 0.07, 0.19, 0.97)"
                  : "none",
              ["--drop-lift" as string]: dropParams.lift,
              ["--drop-angle" as string]: dropParams.angle,
            }}
          >
            <div
              style={{
                position: "absolute",
                display: "flex",
                gap: "24px",
                left: isRevealingPassword ? "20px" : `${52 + yellowPos.faceX}px`,
                top: activeFailPose
                  ? "52px"
                  : isRevealingPassword
                    ? "35px"
                    : `${40 + yellowPos.faceY}px`,
                transition: "all 0.25s cubic-bezier(0, 0, 0.2, 1)",
              }}
            >
              <Pupil
                size={12.5}
                maxDistance={5}
                isBlinking={blinking.yellow}
                mouseX={mouse.x}
                mouseY={mouse.y}
                forceLookX={yForceX}
                forceLookY={yForceY}
              />
              <Pupil
                size={12.5}
                maxDistance={5}
                isBlinking={blinking.yellow}
                mouseX={mouse.x}
                mouseY={mouse.y}
                forceLookX={yForceX}
                forceLookY={yForceY}
              />
            </div>

            {/* Subtle Blush on Yellow */}
            <div
              style={{
                position: "absolute",
                display: "flex",
                gap: "46px",
                left: isRevealingPassword ? "11px" : `${43 + yellowPos.faceX}px`,
                top: activeFailPose
                  ? "70px"
                  : isRevealingPassword
                    ? "53px"
                    : `${58 + yellowPos.faceY}px`,
                opacity: activeFailPose ? 0.15 : 0.5,
                pointerEvents: "none",
                transition: "all 0.25s cubic-bezier(0, 0, 0.2, 1)",
              }}
            >
              <div className="h-2 w-3.5 rounded-full bg-orange-400/55 blur-[1px]" />
              <div className="h-2 w-3.5 rounded-full bg-orange-400/55 blur-[1px]" />
            </div>

            <div
              style={{
                position: "absolute",
                left: isRevealingPassword ? "10px" : `${40 + yellowPos.faceX}px`,
                top: `${(activeFailPose ? 98 : 88) + yellowPos.faceY}px`,
                transition: "all 0.25s cubic-bezier(0, 0, 0.2, 1)",
              }}
            >
              <svg width="80" height="20" viewBox="0 0 80 20">
                <path
                  d={
                    draggingChar === "yellow" && dragPhysics.isLifted
                      ? "M0 10 Q10 16, 20 4 Q30 16, 40 4 Q50 16, 60 4 Q70 16, 80 10"
                      : activeFailPose
                        ? "M0 10 Q10 2, 20 10 Q30 18, 40 10 Q50 2, 60 10 Q70 18, 80 10"
                        : loginSuccess
                          ? "M0 2 Q10 10, 20 14 Q30 18, 40 18 Q50 18, 60 14 Q70 10, 80 2"
                          : "M0 10 Q10 10, 20 10 Q30 10, 40 10 Q50 10, 60 10 Q70 10, 80 10"
                  }
                  stroke="#231F20"
                  strokeWidth="3.2"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* 统一高精度气泡浮层：使用物理头顶坐标精确锚定，尾巴直指角色头部，杜绝 skew 几何偏离 */}
        {bubbles.purple && (
          <StageSpeechBubble
            text={bubbles.purple.text}
            bubbleKey={bubbles.purple.key}
            x={purpleHeadX}
            y={purpleHeadY}
          />
        )}
        {bubbles.black && (
          <StageSpeechBubble
            text={bubbles.black.text}
            bubbleKey={bubbles.black.key}
            x={blackHeadX}
            y={blackHeadY}
          />
        )}
        {bubbles.orange && (
          <StageSpeechBubble
            text={bubbles.orange.text}
            bubbleKey={bubbles.orange.key}
            x={orangeHeadX}
            y={orangeHeadY}
          />
        )}
        {bubbles.yellow && (
          <StageSpeechBubble
            text={bubbles.yellow.text}
            bubbleKey={bubbles.yellow.key}
            x={yellowHeadX}
            y={yellowHeadY}
          />
        )}
      </div>
    </div>
  );
}
