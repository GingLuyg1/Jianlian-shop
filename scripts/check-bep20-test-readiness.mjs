#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_SUPABASE_REF = "czuoivbfxzachiobdohw";

const requiredNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BSC_RPC_URL",
  "BSC_CHAIN_ID",
  "BSC_USDT_CONTRACT",
  "BSC_USDT_DECIMALS",
  "BSC_RECEIVE_ADDRESS",
  "BSC_REQUIRED_CONFIRMATIONS",
  "BSC_PAYMENT_EXPIRE_MINUTES",
  "USDT_PRICING_MODE",
  "CNY_USDT_FIXED_RATE",
  "USDT_AMOUNT_SCALE",
];

function readDotEnvLocal() {
  const filePath = resolve(process.cwd(), ".env.local");
  if (!existsSync(filePath)) return {};
  const result = {};
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const name = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    result[name] = rawValue.replace(/^['"]|['"]$/g, "");
  }
  return result;
}

const dotEnv = readDotEnvLocal();
const config = { ...dotEnv, ...process.env };
const failures = [];

function value(name) {
  return String(config[name] ?? "").trim();
}

function requirePresent(name) {
  if (!value(name)) failures.push(`${name}: MISSING`);
}

function isPositiveInteger(text) {
  return /^[1-9]\d*$/.test(text);
}

function isPositiveNumber(text) {
  return /^\d+(\.\d+)?$/.test(text) && Number(text) > 0;
}

function maskAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

for (const name of requiredNames) requirePresent(name);

const supabaseUrl = value("NEXT_PUBLIC_SUPABASE_URL");
const supabaseMatch = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/);
if (supabaseUrl && !supabaseMatch) failures.push("NEXT_PUBLIC_SUPABASE_URL: invalid Supabase URL");
if (supabaseMatch && supabaseMatch[1] !== REQUIRED_SUPABASE_REF) {
  failures.push(`NEXT_PUBLIC_SUPABASE_URL: expected test ref ${REQUIRED_SUPABASE_REF}, got ${supabaseMatch[1]}`);
}

if (value("BSC_CHAIN_ID") && value("BSC_CHAIN_ID") !== "56") failures.push("BSC_CHAIN_ID: expected 56");

for (const name of ["BSC_USDT_DECIMALS", "BSC_REQUIRED_CONFIRMATIONS", "BSC_PAYMENT_EXPIRE_MINUTES", "USDT_AMOUNT_SCALE"]) {
  if (value(name) && !isPositiveInteger(value(name))) failures.push(`${name}: expected positive integer`);
}

if (value("CNY_USDT_FIXED_RATE") && !isPositiveNumber(value("CNY_USDT_FIXED_RATE"))) {
  failures.push("CNY_USDT_FIXED_RATE: expected positive number");
}

for (const name of ["BSC_USDT_CONTRACT", "BSC_RECEIVE_ADDRESS"]) {
  const address = value(name);
  if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) failures.push(`${name}: invalid EVM address`);
}

if (failures.length > 0) {
  console.error("BEP20 test readiness: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("BEP20 test readiness: PASS");
console.log(`Supabase project ref: ${REQUIRED_SUPABASE_REF}`);
console.log("NEXT_PUBLIC_SUPABASE_ANON_KEY: PRESENT");
console.log("SUPABASE_SERVICE_ROLE_KEY: PRESENT");
console.log("BSC_RPC_URL: PRESENT");
console.log(`BSC_CHAIN_ID: ${value("BSC_CHAIN_ID")}`);
console.log(`BSC_USDT_CONTRACT: ${maskAddress(value("BSC_USDT_CONTRACT"))}`);
console.log(`BSC_RECEIVE_ADDRESS: ${maskAddress(value("BSC_RECEIVE_ADDRESS"))}`);
console.log(`BSC_REQUIRED_CONFIRMATIONS: ${value("BSC_REQUIRED_CONFIRMATIONS")}`);
