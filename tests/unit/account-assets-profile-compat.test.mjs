import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT_ASSETS_CORE_PROFILE_SELECT,
  ACCOUNT_ASSETS_PROFILE_SELECT,
  getAccountAssetsAvailableBalance,
  normalizeAccountAssetsProfile,
} from "../../lib/account/assets-profile-compat.mjs";

const fallback = {
  email: "preview@example.test",
  displayName: null,
  role: "user",
  createdAt: "2026-08-10T00:00:00.000Z",
  balance: 0,
};

test("account assets profile keeps display_name when the compatibility column exists", () => {
  const profile = normalizeAccountAssetsProfile({
    email: "preview@example.test",
    display_name: "Preview User",
    role: "user",
    created_at: "2026-08-10T00:00:00.000Z",
    balance: "100.000000",
  }, fallback);

  assert.equal(profile.displayName, "Preview User");
  assert.equal(profile.balance, 100);
  assert.equal(getAccountAssetsAvailableBalance(profile), 100);
});

test("account assets profile preserves balance when display_name is absent", () => {
  const profile = normalizeAccountAssetsProfile({
    email: "preview@example.test",
    role: "user",
    created_at: "2026-08-10T00:00:00.000Z",
    balance: "100.000000",
  }, fallback);

  assert.equal(profile.displayName, null);
  assert.equal(profile.balance, 100);
  assert.equal(getAccountAssetsAvailableBalance(profile), 100);
});

test("account assets compatibility retry queries balance without optional display_name", () => {
  assert.match(ACCOUNT_ASSETS_PROFILE_SELECT, /display_name/);
  assert.match(ACCOUNT_ASSETS_PROFILE_SELECT, /balance/);
  assert.doesNotMatch(ACCOUNT_ASSETS_CORE_PROFILE_SELECT, /display_name/);
  assert.doesNotMatch(ACCOUNT_ASSETS_CORE_PROFILE_SELECT, /role|created_at/);
  assert.match(ACCOUNT_ASSETS_CORE_PROFILE_SELECT, /(?:^|,)balance(?:,|$)/);
});

test("account assets available balance remains non-negative", () => {
  assert.equal(getAccountAssetsAvailableBalance({ balance: 100 }), 100);
  assert.equal(getAccountAssetsAvailableBalance({ balance: -1 }), 0);
  assert.equal(getAccountAssetsAvailableBalance({ balance: Number.NaN }), 0);
});
