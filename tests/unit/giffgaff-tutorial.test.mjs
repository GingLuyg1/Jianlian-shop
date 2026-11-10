import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Giffgaff has separate activation and keeper guides", () => {
  const page = read("app/tutorials/page.tsx");
  assert.match(page, /id: "giffgaff", label: "Giffgaff", title: "Giffgaff 教程"/);
  assert.match(page, /giffgaffGuide === "activation" \? <GiffgaffActivationTutorial \/> : <GiffgaffTutorial \/>/);
  assert.match(page, /实体卡激活与使用/);
  assert.match(page, /保号助手/);
});

test("activation screenshots use local images and the in-page viewer", () => {
  const source = read("components/account/GiffgaffActivationTutorial.tsx");
  for (let index = 1; index <= 11; index++) {
    const number = String(index).padStart(2, "0");
    assert.ok(existsSync(new URL(`../../public/tutorials/giffgaff/activation-${number}.png`, import.meta.url)));
  }
  assert.match(source, /<TutorialImage key=\{number\}/);
  assert.match(read("components/account/TutorialImage.tsx"), /TransformWrapper/);
  assert.doesNotMatch(source, /<img|iframe|fetch\(/);
});

test("helper is an explicit external link and is never fetched automatically", () => {
  const source = read("components/account/GiffgaffTutorial.tsx");
  assert.match(source, /https:\/\/dennischancs\.github\.io\/gg-keeper\//);
  assert.match(source, /href=\{helper\} target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(source, /fetch\(|iframe|useEffect|setInterval/);
  assert.match(source, /第三方工具，不是 Giffgaff 官方服务/);
});

test("guide distinguishes estimated data use from operator billing", () => {
  const source = read("components/account/GiffgaffTutorial.tsx");
  assert.match(source, /实际流量和扣费还会受/);
  assert.match(source, /不等于手机全部计费流量/);
  assert.match(source, /实际费用可能不同/);
  assert.match(source, /www\.giffgaff\.com\/roaming\/china/);
});
