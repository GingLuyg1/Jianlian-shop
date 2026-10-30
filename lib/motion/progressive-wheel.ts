export const WHEEL_CONFIG = {
  minScale: 0.98,
  maxScale: 1,
  minOpacity: 0.78,
  topPlateauEnd: 0.55,
  bottomPlateauStart: 0.45,
} as const;

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function wheelVisual(itemCenter: number, viewportHeight: number, scrollProgress: number, active = false) {
  if (active || viewportHeight <= 0) return { scale: WHEEL_CONFIG.maxScale, opacity: 1 };
  const position = clamp(itemCenter / viewportHeight, 0, 1);
  const progress = clamp(scrollProgress, 0, 1);
  // At either end the full-size plateau reaches that edge. In the middle it
  // sits between two continuous ramps. Only position, never direction, matters.
  const plateauStart = WHEEL_CONFIG.bottomPlateauStart * progress;
  const plateauEnd = WHEEL_CONFIG.topPlateauEnd + (1 - WHEEL_CONFIG.topPlateauEnd) * progress;
  const distance = position < plateauStart
    ? (plateauStart - position) / Math.max(plateauStart, 0.0001)
    : position > plateauEnd
      ? (position - plateauEnd) / Math.max(1 - plateauEnd, 0.0001)
      : 0;
  const intensity = clamp(distance, 0, 1);
  return {
    scale: WHEEL_CONFIG.maxScale - (WHEEL_CONFIG.maxScale - WHEEL_CONFIG.minScale) * intensity,
    opacity: 1 - (1 - WHEEL_CONFIG.minOpacity) * intensity,
  };
}

export function centeredScrollTop(itemTop: number, itemHeight: number, viewportHeight: number, maxScroll: number, index: number, count: number) {
  if (index === 0) return 0;
  if (index === count - 1) return Math.max(0, maxScroll);
  return clamp(itemTop + itemHeight / 2 - viewportHeight / 2, 0, Math.max(0, maxScroll));
}
