// Test-project-only, read-only query shape check. No credentials or row contents are logged.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const config = new Map();
for (const line of readFileSync(resolve(import.meta.dirname, '../../.env.local'), 'utf8').split(/\r?\n/)) {
  const match = line.trim().match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (match) config.set(match[1], match[2].replace(/^(['"])(.*)\1$/, '$2').trim());
}
if (config.get('NEXT_PUBLIC_SUPABASE_URL') !== 'https://czuoivbfxzachiobdohw.supabase.co') throw Error('TEST_URL_REQUIRED');
const client = createClient(config.get('NEXT_PUBLIC_SUPABASE_URL'), config.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const products = await client.from('products').select('id', { count: 'exact' }).order('updated_at', { ascending: false }).range(0, 9);
if (products.error || products.count === null) throw Error('PRODUCT_PAGE_FAILED');
const ids = (products.data ?? []).map((row) => row.id);
if (ids.length) {
  const missing = await client.from('order_items')
    .select('id,orders!inner(payment_status,paid_at)', { count: 'exact', head: true })
    .in('product_id', ids).eq('orders.payment_status', 'paid').is('orders.paid_at', null);
  if (missing.error || missing.count === null) throw Error('PAID_DATE_GUARD_FAILED');
  const result = await client.from('order_items')
    .select('id,order_id,product_id,quantity,orders!inner(payment_status,paid_at)', { count: 'exact' })
    .in('product_id', ids)
    .eq('orders.payment_status', 'paid')
    .gte('orders.paid_at', '2026-01-01T00:00:00+08:00')
    .lt('orders.paid_at', '2027-01-01T00:00:00+08:00')
    .order('id', { ascending: true })
    .range(0, 499);
  if (result.error || result.count === null) throw Error('PRODUCT_PAID_JOIN_FAILED');
  if ((result.data ?? []).some((row) => !row.orders || Array.isArray(row.orders) || !row.orders.paid_at)) throw Error('PRODUCT_JOIN_SHAPE_INVALID');
  console.log(`V25_PRODUCT_READ_PASS: catalog page ${ids.length}, matched paid item count ${result.count}, missing paid dates ${missing.count}; no row contents output.`);
} else {
  console.log('V25_PRODUCT_READ_PASS: catalog empty; join shape not exercised.');
}
