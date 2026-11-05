import assert from "node:assert/strict";
import test from "node:test";
import { loadPureTypeScript } from "../helpers/load-pure-typescript.mjs";
const { paymentCardTilt } = loadPureTypeScript(new URL("../../lib/motion/payment-card-tilt.ts", import.meta.url));

test("payment card tilt is neutral at the center and symmetric across opposite corners", () => {
  assert.deepEqual(paymentCardTilt(100, 42, 200, 84), { rotateX: 0, rotateY: 0, glareX: 50, glareY: 50 });
  const left = paymentCardTilt(0, 0, 200, 84), right = paymentCardTilt(200, 84, 200, 84);
  assert.equal(left.rotateX, -right.rotateX);
  assert.equal(left.rotateY, -right.rotateY);
  assert.equal(left.glareX, 0); assert.equal(right.glareX, 100);
});

test("payment card tilt stays within its gentle bounds even when the pointer leaves the slot", () => {
  for (const [x, y] of [[-100, -50], [1000, 500], [100, 10], [80, 50]]) {
    const value = paymentCardTilt(x, y, 200, 84);
    assert.ok(Math.abs(value.rotateX) <= 3);
    assert.ok(Math.abs(value.rotateY) <= 4);
    assert.ok(value.glareX >= 0 && value.glareX <= 100);
    assert.ok(value.glareY >= 0 && value.glareY <= 100);
  }
});

test("payment card tilt does not emit invalid transforms for a missing or invalid layout", () => {
  for (const args of [[0, 0, 0, 84], [0, 0, 200, 0], [NaN, 0, 200, 84], [0, 0, Infinity, 84]]) {
    assert.deepEqual(paymentCardTilt(...args), { rotateX: 0, rotateY: 0, glareX: 50, glareY: 50 });
  }
});
