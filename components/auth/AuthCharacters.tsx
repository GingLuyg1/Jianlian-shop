"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface AuthCharactersProps {
  email?: string;
  mode?: "login" | "register";
  isTyping?: boolean;
  isEmailFocused?: boolean;
  isPasswordFocused?: boolean;
  showPassword?: boolean;
  passwordLength?: number;
  loginFailed?: boolean;
  loginSuccess?: boolean;
  compact?: boolean;
}

type CharacterColor = "purple" | "black" | "orange" | "yellow";

interface SpeechBubbleInfo {
  text: string;
  key: number;
}

const CHARACTER_COLORS: CharacterColor[] = ["purple", "black", "orange", "yellow"];

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
    "芜湖~ 验证通过，起飞！✨",
    "欢迎进入 Jianlian.shop！🚀",
    "大门已开启，正在进入系统~",
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
    "看我干嘛，快登录呀~",
    "今天也是元气满满的一天！",
    "发什么呆呢，就等你按登录啦~",
    "你不动我不动，咱们比比谁先眨眼！",
  ],
  poke: [
    "摸鱼没有你这么摸鱼的，还戳我！",
    "别戳啦，痒痒痒~ 😆",
    "再戳我就要收门票啦！",
    "快去登录啦，别玩我了~",
    "弹弹弹，把烦恼都弹走~ ✨",
  ],
  drag: [
    "放开我！抓到我命运的后颈皮了！😆",
    "别拽啦别拽啦，要变形了！",
    "哎呀，拉扯感太强了，好弹！✨",
    "Duang~ 果冻弹簧人变身！",
    "好弹好弹！再拽一次试试？🎉",
    "本座可是高弹性记忆海绵！",
  ],
  dragPlucked: [
    "放我下来啦，吓死宝宝了！😱",
    "哇！刚刚脚底悬空了！",
    "好险好险，差点被抓走了~",
    "咻~ 安全着陆！呼…脚踏实地的感觉真好~ ✨",
    "救命，差点被当成胡萝卜拔出来了！🥕",
  ],
  dragSquashed: [
    "别压了别压了，要变成软糖饼了！🍮",
    "好重好重！谁在给我做全身推拿呀？💆",
    "再压就要从键盘底下溜走啦！💨",
    "呜哇，被压扁成二维生物了！",
    "哎呀呀，我的发型都被压平了！🤣",
  ],
};

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface EyeProps {
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

function Eye({
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
}: EyeProps) {
  const eyeRef = useRef<HTMLDivElement>(null);

  const look = useMemo(() => {
    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }
    if (!eyeRef.current) return { x: 0, y: 0 };
    const rect = eyeRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
    const angle = Math.atan2(dy, dx);
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
    };
  }, [mouseX, mouseY, forceLookX, forceLookY, maxDistance]);

  return (
    <div
      ref={eyeRef}
      style={{
        width: `${size}px`,
        height: isBlinking ? "2.5px" : isSad ? `${0.52 * size}px` : `${size}px`,
        backgroundColor: eyeColor,
        borderRadius: isSad ? `0 0 ${size}px ${size}px` : "50%",
        transform: isSad ? `rotate(${sadRotate}deg)` : "rotate(0deg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "height 0.15s ease-out, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        overflow: "hidden",
        boxShadow: "inset 0 1.5px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)",
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
            transform: `translate(${look.x}px, ${isSad ? -1 : look.y}px)`,
            transition: "transform 0.08s ease-out",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: "1.2px",
              right: "1.2px",
              width: `${Math.max(2, 0.34 * pupilSize)}px`,
              height: `${Math.max(2, 0.34 * pupilSize)}px`,
              borderRadius: "50%",
              backgroundColor: "rgba(255,255,255,0.95)",
            }}
          />
          <span
            style={{
              position: "absolute",
              bottom: "1.2px",
              left: "1.5px",
              width: `${Math.max(1.5, 0.2 * pupilSize)}px`,
              height: `${Math.max(1.5, 0.2 * pupilSize)}px`,
              borderRadius: "50%",
              backgroundColor: "rgba(255,255,255,0.7)",
            }}
          />
        </div>
      )}
    </div>
  );
}

// 头部跟随气泡：作为角色自身的子元素绝对定位在头顶上方，随 squash 和拖动实时跟随
function HeadFollowBubble({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 transition-all duration-200"
      style={{
        bottom: "calc(100% + 12px)",
      }}
    >
      <div className="relative whitespace-nowrap rounded-2xl border border-orange-200/90 bg-white/98 px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-[0_8px_20px_-4px_rgba(234,88,12,0.22)] backdrop-blur-md">
        {text}
        {/* 指向角色头顶的小尖角 */}
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-0 w-0 border-x-[5px] border-x-transparent border-t-[6px] border-t-white" />
      </div>
    </div>
  );
}

export default function AuthCharacters({
  email = "",
  mode = "login",
  isTyping = false,
  isEmailFocused = false,
  isPasswordFocused = false,
  showPassword = false,
  passwordLength = 0,
  loginFailed = false,
  loginSuccess = false,
  compact = false,
}: AuthCharactersProps) {
  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);

  // 默认视线水平居中稍偏上，避免未输入内容时全员偏头斜视
  const [mousePos, setMousePos] = useState({ x: 500, y: 250 });
  const [blinking, setBlinking] = useState<Record<CharacterColor, boolean>>({
    purple: false,
    black: false,
    orange: false,
    yellow: false,
  });
  const [poked, setPoked] = useState<Record<CharacterColor, boolean>>({
    purple: false,
    black: false,
    orange: false,
    yellow: false,
  });
  const [bubbles, setBubbles] = useState<Record<CharacterColor, SpeechBubbleInfo | null>>({
    purple: null,
    black: null,
    orange: null,
    yellow: null,
  });

  const [activeDrag, setActiveDrag] = useState<CharacterColor | null>(null);
  const [dragState, setDragState] = useState({
    shiftX: 0,
    liftY: 0,
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    isLifted: false,
    isSquashed: false,
  });

  const dragStart = useRef({ x: 0, y: 0 });
  const hasMovedEnough = useRef(false);

  // 回弹动效状态
  const [dropLanding, setDropLanding] = useState<CharacterColor | null>(null);
  const [dropParams, setDropParams] = useState({ lift: 60, shift: 0, angle: 0 });
  const [squashRebounding, setSquashRebounding] = useState<CharacterColor | null>(null);
  const [squashParams, setSquashParams] = useState({ sx: 1.2, sy: 0.75 });
  const [jellyRebounding, setJellyRebounding] = useState<CharacterColor | null>(null);

  const [isPeeking, setIsPeeking] = useState(false);
  const [isSadState, setIsSadState] = useState(false);
  const [isCheering, setIsCheering] = useState(false);
  const [mouthOffset, setMouthOffset] = useState(-5);

  const bubbleTimers = useRef<Record<CharacterColor, NodeJS.Timeout | null>>({
    purple: null,
    black: null,
    orange: null,
    yellow: null,
  });
  const hasTriggeredEmailBubble = useRef(false);
  const hasTriggeredLongPassBubble = useRef(false);
  const prevModeRef = useRef(mode);

  // 必须在真实获得焦点且有输入时，才进入密码交互状态；防止浏览器自动填充引起角色误判
  const isPasswordInputActive = isPasswordFocused && passwordLength > 0;
  const isPasswordHidden = isPasswordInputActive && !showPassword;
  const isPasswordRevealed = isPasswordInputActive && showPassword;
  const isTypingActive = (isEmailFocused || isPasswordFocused) && isTyping;

  const triggerBubble = useCallback(
    (text: string, targetColor?: CharacterColor, durationMs = 3200) => {
      const color = targetColor || getRandomItem(CHARACTER_COLORS);
      setBubbles((prev) => ({
        ...prev,
        [color]: { text, key: Date.now() },
      }));

      if (bubbleTimers.current[color]) {
        clearTimeout(bubbleTimers.current[color]!);
      }
      bubbleTimers.current[color] = setTimeout(() => {
        setBubbles((prev) => {
          if (prev[color]?.text === text) {
            return { ...prev, [color]: null };
          }
          return prev;
        });
      }, durationMs);
    },
    []
  );

  // 模式切换（登录/注册）
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode;
      setIsCheering(true);
      triggerBubble(
        mode === "register"
          ? getRandomItem(SPEECH_LINES.modeSwitchRegister)
          : getRandomItem(SPEECH_LINES.modeSwitchLogin)
      );
      const timer = setTimeout(() => setIsCheering(false), 750);
      return () => clearTimeout(timer);
    }
  }, [mode, triggerBubble]);

  // 全局鼠标跟踪
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // 随机眨眼
  useEffect(() => {
    const blinkCycle = () => {
      const target = getRandomItem(CHARACTER_COLORS);
      setBlinking((prev) => ({ ...prev, [target]: true }));
      setTimeout(() => {
        setBlinking((prev) => ({ ...prev, [target]: false }));
      }, 150 + Math.random() * 80);
    };
    const timer = setInterval(blinkCycle, 2400 + Math.random() * 1600);
    return () => clearInterval(timer);
  }, []);

  // 密码显示状态
  useEffect(() => {
    if (isPasswordRevealed) {
      setIsPeeking(false);
      triggerBubble(getRandomItem(SPEECH_LINES.passwordReveal));
    }
  }, [isPasswordRevealed, triggerBubble]);

  // 登录错误
  useEffect(() => {
    if (loginFailed) {
      setIsSadState(true);
      setMouthOffset(12);
      triggerBubble(getRandomItem(SPEECH_LINES.loginError), "purple", 4000);
      const timer = setTimeout(() => {
        setIsSadState(false);
        setMouthOffset(-5);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [loginFailed, triggerBubble]);

  // 登录成功：取消彩带飘落，角色轻快欢呼跳跃
  useEffect(() => {
    if (loginSuccess) {
      setIsCheering(true);
      setMouthOffset(-8);
      triggerBubble(getRandomItem(SPEECH_LINES.loginSuccess), "purple", 4000);
      const cheerTimer = setTimeout(() => setIsCheering(false), 3000);
      return () => clearTimeout(cheerTimer);
    }
  }, [loginSuccess, triggerBubble]);

  // 邮箱输入触发台词
  useEffect(() => {
    if (isEmailFocused && email.length >= 5 && !hasTriggeredEmailBubble.current) {
      hasTriggeredEmailBubble.current = true;
      triggerBubble(getRandomItem(SPEECH_LINES.emailNice), "purple");
    }
  }, [isEmailFocused, email, triggerBubble]);

  // 密码输入触发台词
  useEffect(() => {
    if (isPasswordInputActive && passwordLength >= 8 && !hasTriggeredLongPassBubble.current) {
      hasTriggeredLongPassBubble.current = true;
      triggerBubble(getRandomItem(SPEECH_LINES.passwordLong), "black");
    }
  }, [isPasswordInputActive, passwordLength, triggerBubble]);

  // 闲暇闲聊
  useEffect(() => {
    const idleTimer = setInterval(() => {
      if (
        !isTypingActive &&
        !isPasswordFocused &&
        !isEmailFocused &&
        !loginFailed &&
        !loginSuccess &&
        !activeDrag
      ) {
        if (Math.random() > 0.45) {
          triggerBubble(getRandomItem(SPEECH_LINES.idle), undefined, 2600);
        }
      }
    }, 12000);
    return () => clearInterval(idleTimer);
  }, [
    isTypingActive,
    isPasswordFocused,
    isEmailFocused,
    loginFailed,
    loginSuccess,
    activeDrag,
    triggerBubble,
  ]);

  // 拖拽与按压交互
  const handlePointerDown = (color: CharacterColor, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    hasMovedEnough.current = false;
    setActiveDrag(color);
    setDragState({
      shiftX: 0,
      liftY: 0,
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      isLifted: false,
      isSquashed: false,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDrag) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 5) {
      hasMovedEnough.current = true;
    }

    if (dy < 0) {
      // 向上拔起 (Lift)
      const lift = Math.min(Math.abs(dy), 110);
      const shift = Math.max(-50, Math.min(50, dx * 0.45));
      const angle = Math.max(-12, Math.min(12, dx * 0.14));
      const stretchY = 1 + (lift / 110) * 0.24;
      const squashX = 1 - (lift / 110) * 0.12;

      setDragState({
        shiftX: shift,
        liftY: lift,
        angle: angle,
        scaleX: squashX,
        scaleY: stretchY,
        isLifted: true,
        isSquashed: false,
      });
    } else {
      // 向下按压 (Squash)
      const compress = Math.min(dy, 80);
      const shift = Math.max(-30, Math.min(30, dx * 0.3));
      const squashY = Math.max(0.55, 1 - (compress / 80) * 0.42);
      const expandX = Math.min(1.35, 1 + (compress / 80) * 0.3);

      setDragState({
        shiftX: shift,
        liftY: 0,
        angle: Math.max(-6, Math.min(6, dx * 0.08)),
        scaleX: expandX,
        scaleY: squashY,
        isLifted: false,
        isSquashed: compress > 12,
      });
    }
  };

  // 按压释放平滑过渡，杜绝 0 帧硬切现象
  const handlePointerUp = (color: CharacterColor) => {
    if (activeDrag !== color) return;
    const wasMoved = hasMovedEnough.current;
    const { shiftX, liftY, angle, isLifted, isSquashed, scaleX, scaleY } = dragState;

    setActiveDrag(null);
    setDragState({
      shiftX: 0,
      liftY: 0,
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      isLifted: false,
      isSquashed: false,
    });

    if (wasMoved) {
      if (isLifted && liftY > 16) {
        setDropParams({
          lift: Math.round(liftY),
          shift: Math.round(shiftX),
          angle: Math.round(angle),
        });
        setDropLanding(color);
        setTimeout(() => setDropLanding(null), 750);
        triggerBubble(getRandomItem(SPEECH_LINES.dragPlucked), color, 3000);
      } else if (isSquashed) {
        setSquashParams({
          sx: Number(scaleX.toFixed(2)),
          sy: Number(scaleY.toFixed(2)),
        });
        setSquashRebounding(color);
        setTimeout(() => setSquashRebounding(null), 650);
        triggerBubble(getRandomItem(SPEECH_LINES.dragSquashed), color, 2800);
      } else {
        setJellyRebounding(color);
        setTimeout(() => setJellyRebounding(null), 650);
        triggerBubble(getRandomItem(SPEECH_LINES.drag), color, 2800);
      }
    } else {
      // 戳一戳
      setPoked((prev) => ({ ...prev, [color]: true }));
      setTimeout(() => setPoked((prev) => ({ ...prev, [color]: false })), 480);
      triggerBubble(getRandomItem(SPEECH_LINES.poke), color, 3000);
    }
  };

  const getTransform = (color: CharacterColor, defaultTransform: string) => {
    if (activeDrag === color) {
      const { shiftX, liftY, angle, scaleX, scaleY } = dragState;
      return `translateX(${shiftX}px) translateY(${-liftY}px) rotate(${angle}deg) scale(${scaleX}, ${scaleY})`;
    }
    if (dropLanding === color || squashRebounding === color) {
      return "none";
    }
    return defaultTransform;
  };

  // 坐标位移计算（通用面部中心偏移）
  const calculateOffset = (
    el: HTMLElement | null,
    defaultFaceX = 0,
    defaultFaceY = 0,
    minX: number | null = null,
    maxX: number | null = null,
    minY: number | null = null,
    maxY: number | null = null,
    damping = 1 / 3
  ) => {
    if (!el) return { faceX: 0, faceY: 0, bodySkew: 0 };
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * damping;
    const clampMinX = minX !== null ? minX : -defaultFaceX;
    const clampMaxX = maxX !== null ? maxX : defaultFaceX;
    const clampMinY = minY !== null ? minY : -defaultFaceY;
    const clampMaxY = maxY !== null ? maxY : defaultFaceY;

    const dx = mousePos.x - cx;
    const dy = mousePos.y - cy;
    const maxBoundX = Math.max(Math.abs(clampMinX), Math.abs(clampMaxX), 1);
    const maxBoundY = Math.max(Math.abs(clampMinY), Math.abs(clampMaxY), 1);

    return {
      faceX: Math.max(clampMinX, Math.min(clampMaxX, dx / (320 / maxBoundX))),
      faceY: Math.max(clampMinY, Math.min(clampMaxY, dy / (320 / maxBoundY))),
      bodySkew: Math.max(-4, Math.min(4, -dx / 160)),
    };
  };

  // 各角色面部偏移
  const purpleFace = calculateOffset(purpleRef.current, 0, 0, -36, 16, -8, 6);
  const blackFace = calculateOffset(blackRef.current, 0, 0, -14, 14, -8, 8);
  // 橘色角色灵敏度统一！五官紧密同轴同步，不再过度偏离
  const orangeFace = calculateOffset(orangeRef.current, 0, 0, -16, 16, -10, 10, 0.3);
  const yellowFace = calculateOffset(yellowRef.current, 0, 0, -14, 14, -8, 8);

  // 高度计算
  const purpleHeight = isSadState ? 365 : isTypingActive || isPasswordHidden ? 435 : 400;
  const blackHeight = isSadState ? 284 : 312;
  const orangeHeight = isSadState ? 135 : 154;
  const yellowHeight = isSadState ? 210 : 232;

  const purpleBottomRadius =
    activeDrag === "purple" && dragState.liftY > 0
      ? 18
      : dropLanding === "purple"
      ? 14
      : activeDrag === "purple" && dragState.isSquashed
      ? 32
      : 8;

  const blackBottomRadius =
    activeDrag === "black" && dragState.liftY > 0
      ? 18
      : dropLanding === "black"
      ? 14
      : activeDrag === "black" && dragState.isSquashed
      ? 32
      : 8;

  const orangeBottomRadius =
    activeDrag === "orange" && dragState.liftY > 0
      ? 45
      : dropLanding === "orange"
      ? 30
      : activeDrag === "orange" && dragState.isSquashed
      ? 55
      : 18;

  const yellowBottomRadius =
    activeDrag === "yellow" && dragState.liftY > 0
      ? 20
      : dropLanding === "yellow"
      ? 14
      : activeDrag === "yellow" && dragState.isSquashed
      ? 36
      : 8;

  // 眼睛强制注视坐标（输入与拖拽联动）
  const purpleForceX =
    isSadState || loginSuccess
      ? 0
      : isPasswordRevealed
      ? -4
      : isPasswordHidden
      ? -28
      : isTypingActive
      ? 12
      : activeDrag === "purple"
      ? 0
      : activeDrag === "black"
      ? 4
      : activeDrag === "orange"
      ? 3
      : activeDrag === "yellow"
      ? 5
      : undefined;

  const purpleForceY =
    isSadState
      ? 5
      : loginSuccess
      ? mouthOffset
      : isPasswordRevealed
      ? -4
      : isPasswordHidden
      ? 15
      : isTypingActive
      ? 5
      : activeDrag === "purple"
      ? 0
      : activeDrag === "black" || activeDrag === "orange"
      ? 4
      : activeDrag === "yellow"
      ? 3
      : undefined;

  const blackForceX =
    isSadState || loginSuccess
      ? 0
      : isPasswordRevealed
      ? -4
      : isPasswordHidden
      ? -18
      : isTypingActive
      ? 14
      : activeDrag === "black"
      ? 0
      : activeDrag === "purple"
      ? -5
      : activeDrag === "orange"
      ? -4
      : activeDrag === "yellow"
      ? 5
      : undefined;

  const blackForceY =
    isSadState
      ? 5
      : loginSuccess
      ? mouthOffset
      : isPasswordRevealed
      ? -4
      : isPasswordHidden
      ? 12
      : isTypingActive
      ? 6
      : activeDrag === "black"
      ? 0
      : activeDrag === "purple"
      ? -3
      : activeDrag === "orange"
      ? 4
      : activeDrag === "yellow"
      ? 2
      : undefined;

  // 橘色角色注视：常态看鼠标，输入密码时才关注
  const orangeForceX =
    isSadState || loginSuccess
      ? 0
      : isPasswordRevealed
      ? -5
      : isPasswordHidden
      ? 4
      : activeDrag === "orange"
      ? 0
      : activeDrag === "purple" || activeDrag === "black"
      ? 4
      : activeDrag === "yellow"
      ? 5
      : undefined;

  const orangeForceY =
    isSadState
      ? 4
      : loginSuccess
      ? mouthOffset
      : isPasswordRevealed
      ? -4
      : isPasswordHidden
      ? 2
      : activeDrag === "orange"
      ? 4
      : activeDrag === "purple"
      ? -5
      : activeDrag === "black"
      ? -4
      : activeDrag === "yellow"
      ? -3
      : undefined;

  const yellowForceX =
    isPasswordRevealed
      ? -4
      : activeDrag === "yellow"
      ? 0
      : activeDrag === "purple"
      ? -5
      : activeDrag === "black"
      ? -4
      : activeDrag === "orange"
      ? -5
      : undefined;

  const yellowForceY =
    isPasswordRevealed
      ? -4
      : activeDrag === "yellow"
      ? 4
      : activeDrag === "purple"
      ? -5
      : activeDrag === "black"
      ? -2
      : activeDrag === "orange"
      ? 3
      : undefined;

  return (
    <div
      className={`relative select-none ${
        compact ? "h-[320px] w-[360px]" : "h-[420px] w-[460px]"
      } max-w-full overflow-visible transition-all duration-300`}
      style={
        {
          "--drop-lift": `${dropParams.lift}px`,
          "--drop-shift": `${dropParams.shift}px`,
          "--drop-angle": `${dropParams.angle}deg`,
          "--squash-sx": `${squashParams.sx}`,
          "--squash-sy": `${squashParams.sy}`,
        } as React.CSSProperties
      }
    >
      {/* 动效关键帧样式注入 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes jianlian-error-shake {
          0%, 100% { transform: translateX(0); }
          15%, 45%, 75% { transform: translateX(-6px); }
          30%, 60%, 90% { transform: translateX(6px); }
        }
        @keyframes jianlian-cheer-bounce {
          0%, 100% { transform: translateY(0); }
          30% { transform: translateY(-22px) scale(1.03, 0.97); }
          55% { transform: translateY(-6px) scale(0.98, 1.02); }
          75% { transform: translateY(-16px) scale(1.02, 0.98); }
        }
        @keyframes jianlian-jelly-rebound {
          0% { transform: scale(1.18, 0.84); }
          28% { transform: scale(0.9, 1.14); }
          52% { transform: scale(1.08, 0.94); }
          74% { transform: scale(0.97, 1.03); }
          90% { transform: scale(1.02, 0.99); }
          100% { transform: scale(1, 1); }
        }
        @keyframes jianlian-drop-land {
          0% {
            transform: translate(calc(var(--drop-shift, 0) * 1px), calc(var(--drop-lift, 60) * -1px)) rotate(calc(var(--drop-angle, 0) * 1deg)) scale(0.92, 1.08);
          }
          38% {
            transform: translate(0px, 0px) rotate(0deg) scale(1.22, 0.78);
          }
          65% {
            transform: translate(0px, -18px) rotate(0deg) scale(0.94, 1.06);
          }
          82% {
            transform: translate(0px, 0px) rotate(0deg) scale(1.05, 0.97);
          }
          94% {
            transform: translate(0px, -3px) rotate(0deg) scale(0.99, 1.01);
          }
          100% {
            transform: translate(0px, 0px) rotate(0deg) scale(1, 1);
          }
        }
        @keyframes jianlian-squash-rebound {
          0% { transform: scale(var(--squash-sx, 1.2), var(--squash-sy, 0.75)); }
          38% { transform: scale(0.92, 1.14); }
          65% { transform: scale(1.05, 0.96); }
          84% { transform: scale(0.98, 1.02); }
          100% { transform: scale(1, 1); }
        }
        @keyframes jianlian-shadow-impact {
          0% { transform: scale(0.7); opacity: 0.16; }
          38% { transform: scale(1.3); opacity: 0.38; }
          65% { transform: scale(0.85); opacity: 0.18; }
          82% { transform: scale(1.08); opacity: 0.28; }
          100% { transform: scale(0.6); opacity: 0; }
        }
      `,
        }}
      />

      {/* 角色舞台区域 */}
      <div
        className={`relative h-full w-full ${
          loginFailed ? "animate-[jianlian-error-shake_0.6s_ease-in-out]" : ""
        }`}
        onPointerMove={handlePointerMove}
      >
        <div className="absolute bottom-0 left-0 right-0 h-full overflow-visible">
          {/* 角色落地投影 */}
          {(activeDrag === "purple" && dragState.liftY > 4) || dropLanding === "purple" ? (
            <div
              className={`absolute bottom-[-6px] transition-opacity duration-200 ${
                dropLanding === "purple" ? "animate-[jianlian-shadow-impact_0.75s_ease-out]" : ""
              }`}
              style={{
                left: `${70 + (activeDrag === "purple" ? 0.25 * dragState.shiftX : 0)}px`,
                width: "148px",
                height: "14px",
                borderRadius: "50%",
                background: "radial-gradient(ellipse at center, rgba(80,40,150,0.36) 0%, rgba(80,40,150,0) 70%)",
                transform: `scale(${Math.max(0.4, 1 - 0.008 * (dragState.liftY || dropParams.lift))})`,
              }}
            />
          ) : null}

          {(activeDrag === "black" && dragState.liftY > 4) || dropLanding === "black" ? (
            <div
              className={`absolute bottom-[-6px] transition-opacity duration-200 ${
                dropLanding === "black" ? "animate-[jianlian-shadow-impact_0.75s_ease-out]" : ""
              }`}
              style={{
                left: `${240 + (activeDrag === "black" ? 0.25 * dragState.shiftX : 0)}px`,
                width: "122px",
                height: "12px",
                borderRadius: "50%",
                background: "radial-gradient(ellipse at center, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0) 70%)",
                transform: `scale(${Math.max(0.4, 1 - 0.008 * (dragState.liftY || dropParams.lift))})`,
              }}
            />
          ) : null}

          {(activeDrag === "orange" && dragState.liftY > 4) || dropLanding === "orange" ? (
            <div
              className={`absolute bottom-[-6px] transition-opacity duration-200 ${
                dropLanding === "orange" ? "animate-[jianlian-shadow-impact_0.75s_ease-out]" : ""
              }`}
              style={{
                left: `${40 + (activeDrag === "orange" ? 0.25 * dragState.shiftX : 0)}px`,
                width: "240px",
                height: "18px",
                borderRadius: "50%",
                background: "radial-gradient(ellipse at center, rgba(234,88,12,0.38) 0%, rgba(234,88,12,0) 70%)",
                transform: `scale(${Math.max(0.4, 1 - 0.008 * (dragState.liftY || dropParams.lift))})`,
              }}
            />
          ) : null}

          {(activeDrag === "yellow" && dragState.liftY > 4) || dropLanding === "yellow" ? (
            <div
              className={`absolute bottom-[-6px] transition-opacity duration-200 ${
                dropLanding === "yellow" ? "animate-[jianlian-shadow-impact_0.75s_ease-out]" : ""
              }`}
              style={{
                left: `${330 + (activeDrag === "yellow" ? 0.25 * dragState.shiftX : 0)}px`,
                width: "102px",
                height: "11px",
                borderRadius: "50%",
                background: "radial-gradient(ellipse at center, rgba(140,110,20,0.32) 0%, rgba(140,110,20,0) 70%)",
                transform: `scale(${Math.max(0.4, 1 - 0.008 * (dragState.liftY || dropParams.lift))})`,
              }}
            />
          ) : null}

          {/* 1. 紫色长条角色 (Purple) */}
          <div
            ref={purpleRef}
            onPointerDown={(e) => handlePointerDown("purple", e)}
            onPointerMove={handlePointerMove}
            onPointerUp={() => handlePointerUp("purple")}
            onPointerCancel={() => handlePointerUp("purple")}
            style={{
              position: "absolute",
              bottom: 0,
              left: "70px",
              width: "148px",
              height: `${purpleHeight}px`,
              borderRadius: `16px 16px ${purpleBottomRadius}px ${purpleBottomRadius}px`,
              backgroundColor: "#7B68EE",
              zIndex: activeDrag === "purple" ? 40 : 10,
              cursor: activeDrag === "purple" ? "grabbing" : "grab",
              touchAction: "none",
              transformOrigin: "bottom center",
              transform: getTransform(
                "purple",
                `skewX(${purpleFace.bodySkew}deg) ${
                  poked.purple ? "scale(0.96, 1.05) translateY(-6px)" : ""
                } ${loginSuccess || isCheering ? "translateY(-12px)" : ""}`
              ),
              transition:
                activeDrag === "purple"
                  ? "none"
                  : dropLanding === "purple"
                  ? "none"
                  : squashRebounding === "purple"
                  ? "none"
                  : jellyRebounding === "purple"
                  ? "none"
                  : "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.3s ease",
            }}
            className={`shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_12px_24px_-6px_rgba(123,104,238,0.35)] ${
              dropLanding === "purple"
                ? "animate-[jianlian-drop-land_0.75s_cubic-bezier(0.2,0.8,0.25,1)]"
                : squashRebounding === "purple"
                ? "animate-[jianlian-squash-rebound_0.65s_ease-out]"
                : jellyRebounding === "purple"
                ? "animate-[jianlian-jelly-rebound_0.65s_ease-out]"
                : loginSuccess || isCheering
                ? "animate-[jianlian-cheer-bounce_0.8s_ease-in-out_infinite]"
                : ""
            }`}
          >
            {/* 头顶跟随气泡 */}
            <HeadFollowBubble text={bubbles.purple?.text} />

            {/* 眼睛 */}
            <div
              style={{
                position: "absolute",
                display: "flex",
                gap: "30px",
                left: isPasswordRevealed ? "46px" : isCheering ? "82px" : `${72 + purpleFace.faceX}px`,
                top: isSadState ? "48px" : isPasswordRevealed ? "34px" : isCheering ? "28px" : "44px",
                transition: "all 0.22s ease-out",
              }}
            >
              <Eye
                size={18}
                pupilSize={7.5}
                maxDistance={5.5}
                isBlinking={blinking.purple}
                isSad={isSadState}
                sadRotate={-16}
                mouseX={mousePos.x}
                mouseY={mousePos.y}
                forceLookX={purpleForceX}
                forceLookY={purpleForceY}
              />
              <Eye
                size={18}
                pupilSize={7.5}
                maxDistance={5.5}
                isBlinking={blinking.purple}
                isSad={isSadState}
                sadRotate={16}
                mouseX={mousePos.x}
                mouseY={mousePos.y}
                forceLookX={purpleForceX}
                forceLookY={purpleForceY}
              />
            </div>

            {/* 腮红 */}
            <div
              style={{
                position: "absolute",
                display: "flex",
                gap: "56px",
                left: isPasswordRevealed ? "41px" : isCheering ? "76px" : `${66 + purpleFace.faceX}px`,
                top: isSadState ? "63px" : isPasswordRevealed ? "44px" : isCheering ? "42px" : "58px",
                transition: "all 0.22s ease-out",
              }}
            >
              <div className="h-2.5 w-4 rounded-full bg-pink-300 blur-[1.5px]" />
              <div className="h-2.5 w-4 rounded-full bg-pink-300 blur-[1.5px]" />
            </div>

            {/* 嘴巴 */}
            <div
              style={{
                position: "absolute",
                left: isPasswordRevealed ? "70px" : isCheering ? "104px" : `${94 + purpleFace.faceX}px`,
                top: isSadState ? "72px" : isPasswordRevealed ? "55px" : isCheering ? "80px" : `${56 + mouthOffset + purpleFace.faceY}px`,
                transition: "all 0.22s ease-out",
              }}
            >
              <svg width="34" height="22" viewBox="0 0 34 22">
                {activeDrag === "purple" && dragState.isLifted ? (
                  <>
                    <ellipse cx="17" cy="11" rx="8" ry="10" fill="#231F20" />
                    <ellipse cx="17" cy="15.5" rx="5" ry="3.5" fill="#FF6584" opacity="0.9" />
                  </>
                ) : isSadState ? (
                  <path d="M 5 15 Q 17 5, 29 15" stroke="#231F20" strokeWidth="3.2" fill="none" strokeLinecap="round" />
                ) : loginSuccess || isCheering ? (
                  <>
                    <path d="M 3 5 Q 17 21, 31 5 Q 17 8, 3 5 Z" fill="#231F20" />
                    <path d="M 9 12 Q 17 8, 25 12 Q 17 20, 9 12 Z" fill="#FF6584" />
                  </>
                ) : isPeeking ? (
                  <>
                    <path d="M 5 7 Q 17 18, 29 8" stroke="#231F20" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <path d="M 17 11 Q 23 11, 24 16 Q 19 18, 15 15 Z" fill="#FF6584" />
                  </>
                ) : isTypingActive || isPasswordHidden ? (
                  <path d="M 9 11 Q 17 15, 25 11" stroke="#231F20" strokeWidth="2.8" fill="none" strokeLinecap="round" />
                ) : (
                  <>
                    <path d="M 5 6 Q 17 18, 29 6 Q 17 8, 5 6 Z" fill="#231F20" />
                    <path d="M 10 11 Q 17 8, 24 11 Q 17 17, 10 11 Z" fill="#FF6584" opacity="0.9" />
                  </>
                )}
              </svg>
            </div>
          </div>

          {/* 2. 黑色细长角色 (Black) */}
          <div
            ref={blackRef}
            onPointerDown={(e) => handlePointerDown("black", e)}
            onPointerMove={handlePointerMove}
            onPointerUp={() => handlePointerUp("black")}
            onPointerCancel={() => handlePointerUp("black")}
            style={{
              position: "absolute",
              bottom: 0,
              left: "240px",
              width: "122px",
              height: `${blackHeight}px`,
              borderRadius: `14px 14px ${blackBottomRadius}px ${blackBottomRadius}px`,
              backgroundColor: "#231F20",
              zIndex: activeDrag === "black" ? 40 : 15,
              cursor: activeDrag === "black" ? "grabbing" : "grab",
              touchAction: "none",
              transformOrigin: "bottom center",
              transform: getTransform(
                "black",
                `skewX(${blackFace.bodySkew}deg) ${
                  poked.black ? "scale(0.96, 1.05) translateY(-6px)" : ""
                } ${loginSuccess || isCheering ? "translateY(-14px)" : ""}`
              ),
              transition:
                activeDrag === "black"
                  ? "none"
                  : dropLanding === "black"
                  ? "none"
                  : squashRebounding === "black"
                  ? "none"
                  : jellyRebounding === "black"
                  ? "none"
                  : "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.3s ease",
            }}
            className={`shadow-[inset_0_2px_4px_rgba(255,255,255,0.18),0_12px_24px_-6px_rgba(0,0,0,0.45)] ${
              dropLanding === "black"
                ? "animate-[jianlian-drop-land_0.75s_cubic-bezier(0.2,0.8,0.25,1)]"
                : squashRebounding === "black"
                ? "animate-[jianlian-squash-rebound_0.65s_ease-out]"
                : jellyRebounding === "black"
                ? "animate-[jianlian-jelly-rebound_0.65s_ease-out]"
                : loginSuccess || isCheering
                ? "animate-[jianlian-cheer-bounce_0.8s_ease-in-out_infinite]"
                : ""
            }`}
          >
            {/* 头顶跟随气泡 */}
            <HeadFollowBubble text={bubbles.black?.text} />

            {/* 眼睛 */}
            <div
              style={{
                position: "absolute",
                display: "flex",
                gap: "24px",
                left: isPasswordRevealed ? "26px" : `${38 + blackFace.faceX}px`,
                top: isSadState ? "38px" : isPasswordRevealed ? "26px" : "32px",
                transition: "all 0.22s ease-out",
              }}
            >
              <Eye
                size={17}
                pupilSize={7}
                maxDistance={5}
                isBlinking={blinking.black}
                isSad={isSadState}
                sadRotate={-16}
                mouseX={mousePos.x}
                mouseY={mousePos.y}
                forceLookX={blackForceX}
                forceLookY={blackForceY}
              />
              <Eye
                size={17}
                pupilSize={7}
                maxDistance={5}
                isBlinking={blinking.black}
                isSad={isSadState}
                sadRotate={16}
                mouseX={mousePos.x}
                mouseY={mousePos.y}
                forceLookX={blackForceX}
                forceLookY={blackForceY}
              />
            </div>
          </div>

          {/* 3. 橘色胖墩角色 (Orange) - 【核心打磨：换上紫色同款微甜粉舌微笑嘴，五官眼嘴强同频联动，绝不再脱节！】 */}
          <div
            ref={orangeRef}
            onPointerDown={(e) => handlePointerDown("orange", e)}
            onPointerMove={handlePointerMove}
            onPointerUp={() => handlePointerUp("orange")}
            onPointerCancel={() => handlePointerUp("orange")}
            style={{
              position: "absolute",
              bottom: 0,
              left: "40px",
              width: "240px",
              height: `${orangeHeight}px`,
              borderRadius: `125px 125px ${orangeBottomRadius}px ${orangeBottomRadius}px`,
              backgroundColor: "#FF6F3C",
              zIndex: activeDrag === "orange" ? 40 : 20,
              cursor: activeDrag === "orange" ? "grabbing" : "grab",
              touchAction: "none",
              transformOrigin: "bottom center",
              transform: getTransform(
                "orange",
                `skewX(${orangeFace.bodySkew}deg) ${
                  poked.orange ? "scale(0.96, 1.05) translateY(-5px)" : ""
                } ${loginSuccess || isCheering ? "translateY(-10px)" : ""}`
              ),
              transition:
                activeDrag === "orange"
                  ? "none"
                  : dropLanding === "orange"
                  ? "none"
                  : squashRebounding === "orange"
                  ? "none"
                  : jellyRebounding === "orange"
                  ? "none"
                  : "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.3s ease",
            }}
            className={`shadow-[inset_0_3px_6px_rgba(255,255,255,0.45),0_12px_24px_-6px_rgba(255,111,60,0.38)] ${
              dropLanding === "orange"
                ? "animate-[jianlian-drop-land_0.75s_cubic-bezier(0.2,0.8,0.25,1)]"
                : squashRebounding === "orange"
                ? "animate-[jianlian-squash-rebound_0.65s_ease-out]"
                : jellyRebounding === "orange"
                ? "animate-[jianlian-jelly-rebound_0.65s_ease-out]"
                : loginSuccess || isCheering
                ? "animate-[jianlian-cheer-bounce_0.8s_ease-in-out_infinite]"
                : ""
            }`}
          >
            {/* 头顶跟随气泡：作为角色内部子元素，随橘色下压压缩 scaleY 实时跟随 */}
            <HeadFollowBubble text={bubbles.orange?.text} />

            {/* 面部五官一体联动容器 (Face Container)：眼睛、腮红、嘴巴严格同轴同速 */}
            <div
              style={{
                position: "absolute",
                left: isPasswordRevealed ? "80px" : `${108 + orangeFace.faceX}px`,
                top: isSadState ? "68px" : isPasswordRevealed ? "55px" : `${62 + orangeFace.faceY}px`,
                transition: "left 0.12s ease-out, top 0.12s ease-out",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {/* 眼睛 */}
              <div style={{ display: "flex", gap: "34px" }}>
                <Eye
                  size={16.5}
                  pupilSize={7.5}
                  maxDistance={5.5}
                  isBlinking={blinking.orange}
                  isSad={isSadState}
                  sadRotate={-15}
                  mouseX={mousePos.x}
                  mouseY={mousePos.y}
                  forceLookX={orangeForceX}
                  forceLookY={orangeForceY}
                />
                <Eye
                  size={16.5}
                  pupilSize={7.5}
                  maxDistance={5.5}
                  isBlinking={blinking.orange}
                  isSad={isSadState}
                  sadRotate={15}
                  mouseX={mousePos.x}
                  mouseY={mousePos.y}
                  forceLookX={orangeForceX}
                  forceLookY={orangeForceY}
                />
              </div>

              {/* 腮红 */}
              <div
                style={{
                  position: "absolute",
                  top: "14px",
                  display: "flex",
                  gap: "54px",
                }}
              >
                <div className="h-2.5 w-4 rounded-full bg-rose-500/55 blur-[1.5px]" />
                <div className="h-2.5 w-4 rounded-full bg-rose-500/55 blur-[1.5px]" />
              </div>

              {/* 嘴巴：【重点升级】换成与紫色同款的高颜值微甜粉舌微笑嘴，紧随眼球同轴微动 */}
              <div
                style={{
                  position: "absolute",
                  top: "22px",
                  transition: "transform 0.08s ease-out",
                }}
              >
                <svg width="34" height="22" viewBox="0 0 34 22">
                  {activeDrag === "orange" && dragState.isLifted ? (
                    <>
                      <ellipse cx="17" cy="11" rx="8" ry="10" fill="#231F20" />
                      <ellipse cx="17" cy="15.5" rx="5" ry="3.5" fill="#FF6584" opacity="0.9" />
                    </>
                  ) : isSadState ? (
                    <path d="M 5 15 Q 17 5, 29 15" stroke="#231F20" strokeWidth="3.2" fill="none" strokeLinecap="round" />
                  ) : loginSuccess || isCheering ? (
                    <>
                      <path d="M 3 5 Q 17 21, 31 5 Q 17 8, 3 5 Z" fill="#231F20" />
                      <path d="M 9 12 Q 17 8, 25 12 Q 17 20, 9 12 Z" fill="#FF6584" />
                    </>
                  ) : (
                    /* 微甜粉舌元气微笑嘴（与紫色同款，彻底告别丑丑的黑洞 O 型嘴） */
                    <>
                      <path d="M 5 6 Q 17 18, 29 6 Q 17 8, 5 6 Z" fill="#231F20" />
                      <path d="M 10 11 Q 17 8, 24 11 Q 17 17, 10 11 Z" fill="#FF6584" opacity="0.9" />
                    </>
                  )}
                </svg>
              </div>
            </div>
          </div>

          {/* 4. 黄色呆萌角色 (Yellow) */}
          <div
            ref={yellowRef}
            onPointerDown={(e) => handlePointerDown("yellow", e)}
            onPointerMove={handlePointerMove}
            onPointerUp={() => handlePointerUp("yellow")}
            onPointerCancel={() => handlePointerUp("yellow")}
            style={{
              position: "absolute",
              bottom: 0,
              left: "312px",
              width: "140px",
              height: `${yellowHeight}px`,
              borderRadius: `70px 70px ${yellowBottomRadius}px ${yellowBottomRadius}px`,
              backgroundColor: "#E5C158",
              zIndex: activeDrag === "yellow" ? 40 : 25,
              cursor: activeDrag === "yellow" ? "grabbing" : "grab",
              touchAction: "none",
              transformOrigin: "bottom center",
              transform: getTransform(
                "yellow",
                `skewX(${yellowFace.bodySkew}deg) ${
                  poked.yellow ? "scale(0.96, 1.05) translateY(-5px)" : ""
                } ${loginSuccess || isCheering ? "translateY(-12px)" : ""}`
              ),
              transition:
                activeDrag === "yellow"
                  ? "none"
                  : dropLanding === "yellow"
                  ? "none"
                  : squashRebounding === "yellow"
                  ? "none"
                  : jellyRebounding === "yellow"
                  ? "none"
                  : "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), height 0.3s ease",
            }}
            className={`shadow-[inset_0_3px_6px_rgba(255,255,255,0.4),0_12px_24px_-6px_rgba(229,193,88,0.35)] ${
              dropLanding === "yellow"
                ? "animate-[jianlian-drop-land_0.75s_cubic-bezier(0.2,0.8,0.25,1)]"
                : squashRebounding === "yellow"
                ? "animate-[jianlian-squash-rebound_0.65s_ease-out]"
                : jellyRebounding === "yellow"
                ? "animate-[jianlian-jelly-rebound_0.65s_ease-out]"
                : loginSuccess || isCheering
                ? "animate-[jianlian-cheer-bounce_0.8s_ease-in-out_infinite]"
                : ""
            }`}
          >
            {/* 头顶跟随气泡 */}
            <HeadFollowBubble text={bubbles.yellow?.text} />

            {/* 眼睛 */}
            <div
              style={{
                position: "absolute",
                display: "flex",
                gap: "24px",
                left: isPasswordRevealed ? "36px" : `${52 + yellowFace.faceX}px`,
                top: isSadState ? "36px" : isPasswordRevealed ? "26px" : "32px",
                transition: "all 0.22s ease-out",
              }}
            >
              <Eye
                size={15}
                pupilSize={6.5}
                maxDistance={5}
                isBlinking={blinking.yellow}
                isSad={isSadState}
                sadRotate={-15}
                mouseX={mousePos.x}
                mouseY={mousePos.y}
                forceLookX={yellowForceX}
                forceLookY={yellowForceY}
              />
              <Eye
                size={15}
                pupilSize={6.5}
                maxDistance={5}
                isBlinking={blinking.yellow}
                isSad={isSadState}
                sadRotate={15}
                mouseX={mousePos.x}
                mouseY={mousePos.y}
                forceLookX={yellowForceX}
                forceLookY={yellowForceY}
              />
            </div>

            {/* 腮红 */}
            <div
              style={{
                position: "absolute",
                display: "flex",
                gap: "46px",
                left: isPasswordRevealed ? "30px" : `${44 + yellowFace.faceX}px`,
                top: isSadState ? "49px" : isPasswordRevealed ? "39px" : "45px",
                transition: "all 0.22s ease-out",
              }}
            >
              <div className="h-2 w-3.5 rounded-full bg-orange-400/55 blur-[1px]" />
              <div className="h-2 w-3.5 rounded-full bg-orange-400/55 blur-[1px]" />
            </div>

            {/* 嘴巴 */}
            <div
              style={{
                position: "absolute",
                left: isPasswordRevealed ? "42px" : `${56 + yellowFace.faceX}px`,
                top: isSadState ? "68px" : isPasswordRevealed ? "52px" : "58px",
                transition: "all 0.22s ease-out",
              }}
            >
              <svg width="48" height="14" viewBox="0 0 48 14">
                {activeDrag === "yellow" && dragState.isLifted ? (
                  <ellipse cx="24" cy="7" rx="6" ry="5" fill="#231F20" />
                ) : isSadState ? (
                  <path d="M 6 10 Q 24 2, 42 10" stroke="#231F20" strokeWidth="3" fill="none" strokeLinecap="round" />
                ) : loginSuccess || isCheering ? (
                  <path d="M 8 3 Q 24 14, 40 3" stroke="#231F20" strokeWidth="3.2" fill="none" strokeLinecap="round" />
                ) : (
                  <line x1="6" y1="7" x2="42" y2="7" stroke="#231F20" strokeWidth="3" strokeLinecap="round" />
                )}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
