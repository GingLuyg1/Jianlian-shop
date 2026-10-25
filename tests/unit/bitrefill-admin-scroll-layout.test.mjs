import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (name) => readFile(new URL(`../../components/admin/suppliers/Bitrefill${name}Workspace.tsx`, import.meta.url), "utf8");

for (const name of ["Catalog", "Aftercare", "Fulfillment"]) {
  test(`Bitrefill ${name} owns a bounded vertical scroll region inside the admin shell`, async () => {
    const source = await read(name);
    assert.match(source, /return <section className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-6">/);
    assert.doesNotMatch(source, /<main\b/);
    assert.match(source, /aria-label="[^"\n]*分页"/);
    assert.match(source, /controller\.abort\(\)/);
  });
}
