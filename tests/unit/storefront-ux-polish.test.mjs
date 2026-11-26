import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("public support dialog stacks above order detail drawer (z > 81)", () => {
  const layout = read("components/layout/PublicLayout.tsx");
  assert.match(layout, /overlayClassName="z-\[100\]/);
  assert.match(layout, /className="z-\[101\]/);
});

test("category sub-directory only expands when 2 or more subcategories exist", () => {
  const mall = read("components/products/SupabaseMallContent.tsx");
  assert.match(mall, /const hasSubcategories = subItems\.length >= 2;/);
  assert.match(mall, /availableSubcategories\.length >= 2/);
  assert.doesNotMatch(mall, /const hasSubcategories = subItems\.length > 0;/);
});
