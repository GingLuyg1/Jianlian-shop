export type VisibleBounds = {
  theoreticalTop: number;
  theoreticalBottom: number;
  visibleTop: number;
  visibleBottom: number;
  hiddenTop: number;
  hiddenBottom: number;
  clippingAncestor: string | null;
};

const CLIPPING_OVERFLOW_VALUES = new Set(["auto", "clip", "hidden", "scroll"]);

function describeElement(element: Element) {
  const id = element.id ? `#${element.id}` : "";
  const testId = element.getAttribute("data-testid");
  return testId ? `${element.tagName.toLowerCase()}${id}[data-testid="${testId}"]` : `${element.tagName.toLowerCase()}${id}`;
}

export function measureVisibleBounds(element: HTMLElement): VisibleBounds {
  const rect = element.getBoundingClientRect();
  let visibleTop = Math.max(rect.top, 0);
  let visibleBottom = Math.min(rect.bottom, window.innerHeight);
  let clippingAncestor: string | null = null;
  let ancestor = element.parentElement;

  while (ancestor) {
    const style = window.getComputedStyle(ancestor);
    const clipsY = CLIPPING_OVERFLOW_VALUES.has(style.overflowY);

    if (clipsY) {
      const ancestorRect = ancestor.getBoundingClientRect();
      const nextTop = Math.max(visibleTop, ancestorRect.top);
      const nextBottom = Math.min(visibleBottom, ancestorRect.bottom);

      if (nextTop > visibleTop || nextBottom < visibleBottom) {
        clippingAncestor = describeElement(ancestor);
      }

      visibleTop = nextTop;
      visibleBottom = nextBottom;
    }

    ancestor = ancestor.parentElement;
  }

  visibleBottom = Math.max(visibleTop, visibleBottom);

  return {
    theoreticalTop: rect.top,
    theoreticalBottom: rect.bottom,
    visibleTop,
    visibleBottom,
    hiddenTop: Math.max(0, visibleTop - rect.top),
    hiddenBottom: Math.max(0, rect.bottom - visibleBottom),
    clippingAncestor,
  };
}
