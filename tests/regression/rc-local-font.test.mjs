import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root));

test("RC Inter remains a real licensed, pinned local variable font without build-time Google requests", () => {
  const layout = read("app/layout.tsx").toString();
  assert.match(layout, /from "next\/font\/local"/);
  assert.doesNotMatch(layout, /next\/font\/google/);
  assert.match(layout, /src: "\.\/fonts\/InterVariable\.ttf"/);
  assert.match(layout, /weight: "100 900"/);
  assert.match(layout, /display: "swap"/);
  assert.match(layout, /className=\{inter\.className\}/);
  const font = read("app/fonts/InterVariable.ttf");
  assert.equal(font.readUInt32BE(0), 0x00010000);
  assert.equal(font.length, 876576);
  assert.equal(createHash("sha256").update(font).digest("hex"), "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031");
  const license = read("app/fonts/OFL.txt");
  assert.match(license.toString(), /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.equal(createHash("sha256").update(license).digest("hex"), "5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57");
});
