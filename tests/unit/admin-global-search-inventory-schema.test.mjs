import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('inventory global search uses the deployed import_status, not a nonexistent status column', () => {
  const source = readFileSync(new URL('../../lib/admin/global-search.ts', import.meta.url), 'utf8');
  const batch = source.slice(source.indexOf('const batchRows ='), source.indexOf('const nonEmptyGroups ='));
  assert.match(batch, /\.select\("id,batch_no,batch_name,import_status,total_count,available_count,created_at"\)/);
  assert.match(batch, /status: text\(row.import_status\)/);
  assert.doesNotMatch(batch, /status: text\(row.status\)/);
  assert.match(batch, /\.limit\(8\)/);
  assert.doesNotMatch(batch, /content|encrypted|\.(?:insert|update|delete|upsert)\(/);
});
