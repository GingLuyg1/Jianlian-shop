// Read-only startup gate for the independent V2.4 administrator UAT.
// It never prints, transmits, or persists API keys.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const target = 'https://czuoivbfxzachiobdohw.supabase.co';
const productionRef = 'qvbovrvybirscaurwuov';
const allowed = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'EMAIL_PROVIDER',
  'SNPAY_RECONCILIATION_EXECUTE_ENABLED',
  'LIUHAOYI_ALIPAY_WATCHER_EXECUTE_ENABLED',
]);
const dangerousName = /SUPABASE|DATABASE|PAYMENT|CALLBACK|MERCHANT|SNPAY|LIUHAOYI|BSC_|USDT_|RPC|RESEND|POSTMARK|SMTP|TWILIO|SMS|CRON|WORKER|FULFILL|WEBHOOK|INTERNAL_API_SECRET|VERCEL/i;
const failures = [];
const configPath = resolve(root, '.env.local');
const otherLoadedFiles = ['.env', '.env.development', '.env.development.local'];

for (const name of otherLoadedFiles) {
  if (existsSync(resolve(root, name))) failures.push(`存在额外会被 Next.js 加载的配置文件：${name}`);
}
if (!existsSync(configPath)) failures.push('缺少 .env.local');

const config = new Map();
if (existsSync(configPath)) {
  for (const raw of readFileSync(configPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) { failures.push('配置中存在无法解析的行'); continue; }
    const name = match[1];
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2').trim();
    if (config.has(name)) failures.push(`配置重复：${name}`);
    if (!allowed.has(name)) failures.push(`配置含未批准的变量：${name}`);
    if (value.includes(productionRef)) failures.push(`配置含 Production 项目引用：${name}`);
    config.set(name, value);
  }
}

for (const name of Object.keys(process.env)) {
  if (dangerousName.test(name)) failures.push(`启动 shell 存在可能覆盖测试配置或启用外部服务的变量：${name}`);
}

if (config.get('NEXT_PUBLIC_SUPABASE_URL') !== target) failures.push('Supabase URL 不是指定测试项目');
const publicKey = config.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? '';
const secretKey = config.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
if (!/^(sb_publishable_|eyJ)/.test(publicKey)) failures.push('测试项目公开密钥尚未填写或格式不符合预期');
if (!/^(sb_secret_|eyJ)/.test(secretKey)) failures.push('测试项目服务端密钥尚未填写或格式不符合预期');
if (publicKey && publicKey === secretKey) failures.push('公开密钥与服务端密钥相同');
if (config.get('EMAIL_PROVIDER') !== 'none') failures.push('邮件 Provider 未关闭');
if (config.get('SNPAY_RECONCILIATION_EXECUTE_ENABLED') !== 'false') failures.push('SNPAY 执行开关未关闭');
if (config.get('LIUHAOYI_ALIPAY_WATCHER_EXECUTE_ENABLED') !== 'false') failures.push('支付宝执行开关未关闭');

if (failures.length) {
  for (const message of [...new Set(failures)]) console.error(`V24_UAT_PREFLIGHT_BLOCKED: ${message}`);
  process.exitCode = 1;
} else {
  console.log('V24_UAT_LOCAL_CONFIG_PASS: URL、变量范围和禁用开关已检查；未输出任何密钥。');
  console.log('仍须从测试项目控制台确认两把密钥的归属，并确认外部回调/任务隔离后再启动。');
}
