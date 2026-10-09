import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boundedListInteger, listPagination } from '../../lib/admin/list-pagination.mjs';

test('missing, blank and invalid pagination preserve intended defaults', () => {
  for (const value of [null, undefined, '', ' ', 'abc', 'Infinity', NaN]) {
    assert.equal(boundedListInteger(value, 20, 1, 100), 20);
  }
});

test('pagination is finite, integral and bounded for hostile read parameters', () => {
  assert.equal(boundedListInteger('-5', 20, 1, 100), 1);
  assert.equal(boundedListInteger('9999999999', 20, 1, 100), 100);
  assert.equal(boundedListInteger('2.9', 20, 1, 100), 2);
  assert.equal(boundedListInteger('50', 20, 1, 100), 50);
});

test('refund pages expose records beyond the former first 50', () => {
  const rows = Array.from({ length: 101 }, (_, id) => ({ id }));
  const seen = [];
  for (let page = 1; page <= listPagination(rows.length, 1, 50).totalPages; page++) {
    seen.push(...rows.slice((page - 1) * 50, page * 50).map(x => x.id));
    assert.equal(listPagination(rows.length, page, 50).hasNext, page < 3);
  }
  assert.deepEqual(seen, rows.map(x => x.id));
  assert.equal(new Set(seen).size, 101);
});

test('empty and exact boundary results have no phantom next page', () => {
  for (const total of [0, 1, 50]) assert.equal(listPagination(total, 1, 50).hasNext, false);
  assert.equal(listPagination(51, 1, 50).hasNext, true);
  assert.equal(listPagination(100, 2, 50).hasNext, false);
  assert.equal(listPagination(100, 2, 50).hasPrevious, true);
  assert.equal(listPagination('invalid', 1, 50).count, 0);
});

test('refund UI wires server total, resets filters and rejects stale request results', () => {
  const ui = readFileSync(new URL('../../app/admin/refunds/page.tsx', import.meta.url), 'utf8');
  assert.match(ui, /page: String\(page\)/);
  assert.match(ui, /listPagination\(payload.total, page, pageSize\)/);
  assert.match(ui, /<AdminListPagination/);
  assert.match(ui, /setQuery\(event.target.value\); setPage\(1\)/);
  assert.match(ui, /setStatus\(event.target.value\); setPage\(1\)/);
  assert.match(ui, /本页待审核/);
  assert.match(ui, /记录总数未知/);
  assert.equal((ui.match(/version !== requestVersion.current/g) ?? []).length, 2);
  assert.match(ui, /version === requestVersion.current\) setLoading\(false\)/);
  assert.match(ui, /return \(\) => \{ requestVersion.current \+= 1; \}/);
});

test('refund read route still authorizes before queries and never mutates refund records', () => {
  const route = readFileSync(new URL('../../app/api/admin/refunds/route.ts', import.meta.url), 'utf8');
  assert.match(route, /requireApiSuperAdmin/);
  assert.match(route, /boundedListInteger\(searchParams.get\("page"\), 1, 1, 100000\)/);
  assert.match(route, /boundedListInteger\(searchParams.get\("pageSize"\), 20, 1, 100\)/);
  assert.match(route, /count: "exact"/);
  assert.doesNotMatch(route, /\.(?:insert|update|delete|upsert)\(/);
});
