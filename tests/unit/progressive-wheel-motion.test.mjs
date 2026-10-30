import assert from "node:assert/strict";
import test from "node:test";

import { centeredScrollTop, wheelVisual, WHEEL_CONFIG } from "../../lib/motion/progressive-wheel.ts";

test("wheel plateau follows scroll position, not direction", () => {
  assert.equal(WHEEL_CONFIG.minScale, 0.98);
  assert.equal(WHEEL_CONFIG.maxScale, 1);
  assert.equal(wheelVisual(100, 1000, 0).scale, 1);
  assert.equal(wheelVisual(1000, 1000, 0).scale, WHEEL_CONFIG.minScale);
  assert.equal(wheelVisual(500, 1000, 0.5).scale, 1);
  assert.equal(wheelVisual(0, 1000, 0.5).scale, WHEEL_CONFIG.minScale);
  assert.equal(wheelVisual(1000, 1000, 0.5).scale, WHEEL_CONFIG.minScale);
  assert.equal(wheelVisual(0, 1000, 1).scale, WHEEL_CONFIG.minScale);
  assert.equal(wheelVisual(900, 1000, 1).scale, 1);

  const bottom = wheelVisual(300, 1000, 1).scale;
  const slightlyUp = wheelVisual(300, 1000, 0.99).scale;
  assert.ok(Math.abs(bottom - slightlyUp) < 0.01, "reverse movement must be continuous");
  assert.equal(wheelVisual(1000, 1000, 0, true).scale, 1, "clicked active item cannot shrink");
});

test("20 secondary and 20 product items use the same clamped centering", () => {
  const itemCount = 20;
  const itemHeight = 70;
  const rowStep = 80;
  const viewport = 500;
  const maxScroll = itemCount * rowStep - viewport;
  const center = (index) => centeredScrollTop(index * rowStep, itemHeight, viewport, maxScroll, index, itemCount);

  for (const kind of ["secondary", "product"]) {
    assert.equal(center(0), 0, `${kind}: first item`);
    assert.equal(center(19), maxScroll, `${kind}: last item`);
    assert.equal(center(6), 265, `${kind}: 1 → 7`);
    assert.equal(center(14), 905, `${kind}: 20 → 15`);
    assert.ok(center(14) < center(19), `${kind}: reverse click scrolls upward`);
    for (const index of [6, 14]) {
      const itemCenterInViewport = index * rowStep + itemHeight / 2 - center(index);
      assert.equal(itemCenterInViewport, viewport / 2, `${kind}: middle item centers exactly`);
      assert.equal(wheelVisual(itemCenterInViewport, viewport, center(index) / maxScroll, true).scale, 1);
    }
  }
});
