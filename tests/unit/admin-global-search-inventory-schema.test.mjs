import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('inventory global search uses the deployed import_status, not a nonexistent status column', () => {
  const source = readFileSync(new URL('../../lib/admin/global-search.ts', import.meta.url), 'utf8');
  const queryPart = source.slice(source.indexOf('from("digital_inventory_batches")'), source.indexOf('from("digital_inventory_batches")') + 360);
  const mapPart = source.slice(source.indexOf('group: "inventory"'), source.indexOf('const nonEmptyGroups ='));
  assert.match(queryPart, /\.select\("id,batch_no,batch_name,import_status,total_count,available_count,created_at"\)/);
  assert.match(queryPart, /\.limit\(8\)/);
  assert.match(mapPart, /status: text\(row\.import_status\)/);
  assert.doesNotMatch(mapPart, /status: text\(row\.status\)/);
  assert.doesNotMatch(queryPart + mapPart, /content|encrypted|\.(?:insert|update|delete|upsert)\(/);
});
