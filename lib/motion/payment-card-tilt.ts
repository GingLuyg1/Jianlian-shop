export function paymentCardTilt(x: number, y: number, width: number, height: number) {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return { rotateX: 0, rotateY: 0, glareX: 50, glareY: 50 };
  }
  const px = Math.min(1, Math.max(0, x / width));
  const py = Math.min(1, Math.max(0, y / height));
  return { rotateX: (0.5 - py) * 6, rotateY: (px - 0.5) * 8, glareX: px * 100, glareY: py * 100 };
}
