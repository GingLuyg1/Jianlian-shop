"use client";

export type WaterRippleOptions = {
  /** 涟漪发散起点按钮元素；传入后会精准贴合按钮边界与圆角泛起冲击波 */
  originEl?: HTMLElement | null;
  /** 可选指定要快照的水幕根节点；不传时自动捕获当前整页可视视图 */
  snapshotEl?: HTMLElement | null;
  /** 覆盖按钮起始圆角（默认自动读取 originEl 计算样式） */
  borderRadius?: string;
  /** 仅播放同款 2 环香槟白金光学涟漪（用于同页 Tab 切换，不叠加全屏快照遮罩） */
  ringsOnly?: boolean;
};

const PORTAL_ID = "jianlian-login-ripple-portal";
const DURATION_MS = 2800;
const BLUR_PX = 40;
const WAVE_RINGS = 2;

function isMobileViewport() {
  if (typeof document === "undefined" || typeof window === "undefined") return true;
  return (
    window.innerWidth < 1024 ||
    document.documentElement.dataset.mobilePreview === "true" ||
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
}

function buildSnapshotLayer(snapshotEl?: HTMLElement | null): HTMLElement | null {
  if (typeof document === "undefined" || typeof window === "undefined") return null;

  if (snapshotEl) {
    const cloned = snapshotEl.cloneNode(true) as HTMLElement;
    cloned.style.cssText =
      "position:fixed;inset:0;width:100vw;height:100vh;margin:0;pointer-events:none;z-index:1;overflow:hidden;will-change:mask-image,-webkit-mask-image,opacity,transform;";
    cloned.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    return cloned;
  }

  // 自动捕获当前整个可见页面，锁定当前滚动偏移并剥离脚本/通知/已有传送门
  const bodyBg = window.getComputedStyle(document.body).backgroundColor || "#fff8f1";
  const wrapper = document.createElement("div");
  wrapper.style.cssText = [
    "position:fixed",
    "inset:0",
    "width:100vw",
    "height:100vh",
    "margin:0",
    "pointer-events:none",
    "z-index:1",
    "overflow:hidden",
    `background:${bodyBg}`,
    "will-change:mask-image,-webkit-mask-image,opacity,transform",
  ].join(";");

  const scrollBox = document.createElement("div");
  scrollBox.style.cssText = `position:relative;width:100%;min-height:100%;transform:translateY(${-window.scrollY}px);pointer-events:none;`;

  const skipTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "NEXT-ROUTE-ANNOUNCER"]);
  for (const child of Array.from(document.body.children)) {
    const el = child as HTMLElement;
    if (!el || el.id === PORTAL_ID) continue;
    if (skipTags.has(el.tagName)) continue;
    if (el.hasAttribute("data-sonner-toaster") || el.querySelector?.("[data-sonner-toaster]")) {
      // 跳过仅包含 toast 的浮层节点，避免重复克隆通知
      if (el.children.length <= 1) continue;
    }
    const cloned = el.cloneNode(true) as HTMLElement;
    cloned.removeAttribute("id");
    cloned.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    scrollBox.appendChild(cloned);
  }

  wrapper.appendChild(scrollBox);
  return wrapper;
}

/**
 * 严格按照打磨实验室黄金参数挂载全屏水幕涟漪转场到 document.body：
 * - 全程 pointer-events: none，底层瞬间切入 100% 真实可交互目标页
 * - 扩散总时长 (Duration): 2.8s
 * - 水幕羽化虚化度 (Blur): 40px
 * - 冲击波环数 (Wave Rings): 2 环（从触发按钮精确边框轮廓向外泛起涟漪）
 * - 手机端自动跳过，直接流畅进入目标页
 */
export function triggerWaterRippleTransition({
  originEl,
  snapshotEl,
  borderRadius,
  ringsOnly = false,
}: WaterRippleOptions = {}) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (isMobileViewport()) return;

  try {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let btnRect = {
      left: vw * 0.72 - 170,
      top: vh * 0.58 - 22,
      width: 340,
      height: 44,
    };
    let startBorderRadius = borderRadius || "12px";

    if (originEl) {
      const r = originEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        btnRect = { left: r.left, top: r.top, width: r.width, height: r.height };
      }
      if (!borderRadius) {
        const computedRadius = window.getComputedStyle(originEl).borderRadius;
        if (computedRadius && computedRadius !== "0px") {
          startBorderRadius = computedRadius;
        }
      }
    }

    const originX = btnRect.left + btnRect.width / 2;
    const originY = btnRect.top + btnRect.height / 2;
    const maxDist = Math.hypot(
      Math.max(originX, vw - originX),
      Math.max(originY, vh - originY)
    );
    const targetRadius = maxDist * 1.15;
    const startRadius = Math.max(18, Math.min(btnRect.width, btnRect.height) * 0.52);

    const existing = document.getElementById(PORTAL_ID);
    if (existing) existing.remove();

    const host = document.createElement("div");
    host.id = PORTAL_ID;
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;";

    // 1. 顶层 1:1 页面水幕快照（ringsOnly 模式下仅泛起光学涟漪波纹）
    const snapshotLayer = ringsOnly ? null : buildSnapshotLayer(snapshotEl);
    if (snapshotLayer) {
      host.appendChild(snapshotLayer);
    }

    // 2. 从触发按钮精确边框泛起的 2 环香槟白金光学冲击波
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
        `border-radius:${startBorderRadius}`,
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
            borderRadius: startBorderRadius,
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

    // 3. 60fps 逐帧平滑驱动 40px 羽化径向水幕（模拟 cubic-bezier(0.16, 1, 0.3, 1) 液态减速曲线）
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
        snapshotLayer.style.opacity =
          raw > 0.78 ? String(Math.max(0, 1 - (raw - 0.78) / 0.22)) : "1";
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
  } catch {
    // 忽略 DOM 动效异常，不阻塞真实页面导航
  }
}
