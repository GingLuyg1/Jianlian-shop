// Read-only live proof that both locally configured keys are accepted by the
// named test project. Never log keys, response bodies, or request errors.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project = 'czuoivbfxzachiobdohw';
const base = `https://${project}.supabase.co`;
const config = new Map();
for (const raw of readFileSync(resolve(import.meta.dirname, '../../.env.local'), 'utf8').split(/\r?\n/)) {
  const match = raw.trim().match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (match) config.set(match[1], match[2].replace(/^(['"])(.*)\1$/, '$2').trim());
}

function jwtClaims(value) {
  if (!value.startsWith('eyJ')) return null;
  try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8')); }
  catch { return null; }
}

async function probe(path, key) {
  const response = await fetch(`${base}${path}`, {
    method: 'GET',
    headers: { apikey: key },
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
    cache: 'no-store',
  });
  return response;
}

try {
  if (config.get('NEXT_PUBLIC_SUPABASE_URL') !== base) throw Error('URL');
  const publicKey = config.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? '';
  const secretKey = config.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const publicClaims = jwtClaims(publicKey);
  const secretClaims = jwtClaims(secretKey);
  if (publicClaims && (publicClaims.ref !== project || publicClaims.role !== 'anon')) throw Error('PUBLIC_JWT');
  if (secretClaims && (secretClaims.ref !== project || secretClaims.role !== 'service_role')) throw Error('SECRET_JWT');

  // Gateway negative control makes a 200 response meaningful for project ownership.
  const invalid = await probe('/auth/v1/settings', 'v24-invalid-key-control');
  if (invalid.ok) throw Error('NEGATIVE_CONTROL');
  const publicResponse = await probe('/auth/v1/settings', publicKey);
  if (!publicResponse.ok) throw Error('PUBLIC_KEY');
  const authSettings = await publicResponse.json();
  if (JSON.stringify(authSettings).includes('qvbovrvybirscaurwuov')) throw Error('AUTH_PRODUCTION_REFERENCE');

  const secretResponse = await probe('/rest/v1/payment_channels?select=enabled&limit=100', secretKey);
  if (!secretResponse.ok) throw Error('SERVER_KEY');
  const channels = await secretResponse.json();
  if (!Array.isArray(channels) || channels.length !== 5) throw Error('CHANNEL_COUNT');
  if (channels.some((channel) => channel.enabled !== false)) throw Error('CHANNEL_ENABLED');

  console.log('V24_UAT_PROJECT_KEYS_PASS: 两把密钥均被指定测试项目接受；Auth 公开设置无 Production 项目引用；测试库 5/5 支付渠道关闭。');
} catch (error) {
  const category = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'NETWORK_OR_RESPONSE';
  console.error(`V24_UAT_PROJECT_KEYS_BLOCKED: ${category}`);
  process.exitCode = 1;
}
