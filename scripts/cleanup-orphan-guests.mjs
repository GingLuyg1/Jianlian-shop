#!/usr/bin/env node
/**
 * Annual cleanup utility for orphan guest accounts (0 orders, 0 recharges, 0 ledger, 0 balance).
 *
 * Defaults to DRY-RUN mode (`--min-age-days=365`).
 * Pass `--execute` ONLY after reviewing dry-run counts and confirming target project ref.
 *
 * Deleted orphan guest accounts can cleanly re-order / register again with the same contact email.
 */

import { createClient } from "@supabase/supabase-js";

const GUEST_EMAIL_PATTERN = /^guest_[0-9a-f]{16}@guest\.jianlian\.shop$/i;

function parseArgs(argv) {
  const execute = argv.includes("--execute");
  const ageArg = argv.find((arg) => arg.startsWith("--min-age-days="));
  const minAgeDays = ageArg ? Number(ageArg.split("=")[1]) : 365;
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 500;
  if (!Number.isFinite(minAgeDays) || minAgeDays < 30) {
    throw new Error("min-age-days must be a number >= 30 (default: 365)");
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 5000) {
    throw new Error("limit must be between 1 and 5000");
  }
  return { execute, minAgeDays: Math.floor(minAgeDays), limit: Math.floor(limit) };
}

export function isEligibleOrphanGuestUser(user, cutoffMs) {
  if (!user || typeof user !== "object") return false;
  const email = String(user.email ?? "").trim();
  const isGuestMeta = Boolean(user.user_metadata?.is_guest);
  if (!GUEST_EMAIL_PATTERN.test(email) || !isGuestMeta) return false;
  const createdMs = Date.parse(String(user.created_at ?? ""));
  if (!Number.isFinite(createdMs) || createdMs > cutoffMs) return false;
  return true;
}

async function run() {
  const { execute, minAgeDays, limit } = parseArgs(process.argv.slice(2));
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoffMs = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;
  const candidates = [];
  let page = 1;
  const perPage = 200;

  while (candidates.length < limit) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      if (isEligibleOrphanGuestUser(user, cutoffMs)) {
        candidates.push(user);
        if (candidates.length >= limit) break;
      }
    }
    if (users.length < perPage) break;
    page += 1;
  }

  const eligibleToDelete = [];
  for (const user of candidates) {
    const [{ count: orderCount, error: oErr }, { count: rechargeCount, error: rErr }, { count: txCount, error: tErr }, { data: profile, error: pErr }] = await Promise.all([
      service.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      service.from("account_recharges").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      service.from("balance_transactions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      service.from("profiles").select("balance").eq("id", user.id).maybeSingle(),
    ]);
    if (oErr || rErr || tErr || pErr) continue;
    const balance = Number(profile?.balance ?? 0);
    if ((orderCount ?? 0) === 0 && (rechargeCount ?? 0) === 0 && (txCount ?? 0) === 0 && balance === 0) {
      eligibleToDelete.push(user.id);
    }
  }

  console.log(
    JSON.stringify({
      mode: execute ? "execute" : "dry_run",
      minAgeDays,
      cutoffIso: new Date(cutoffMs).toISOString(),
      scannedOldGuests: candidates.length,
      eligibleOrphanGuests: eligibleToDelete.length,
    })
  );

  if (!execute || eligibleToDelete.length === 0) return;

  let deleted = 0;
  let failed = 0;
  for (const userId of eligibleToDelete) {
    const { error: delErr } = await service.auth.admin.deleteUser(userId);
    if (delErr) {
      failed += 1;
    } else {
      deleted += 1;
      await service.from("profiles").delete().eq("id", userId).then(() => undefined, () => undefined);
    }
  }
  console.log(JSON.stringify({ deleted, failed }));
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isCli) {
  run().catch((err) => {
    console.error("[cleanup-orphan-guests] error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
