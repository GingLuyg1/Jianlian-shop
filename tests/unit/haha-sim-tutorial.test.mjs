import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Haha SIM is a distinct searchable tutorial topic", () => {
  const page = read("app/tutorials/page.tsx");
  assert.match(page, /id: "haha-sim", label: "Haha SIM", title: "Haha SIM 实体卡激活与保号教程"/);
  assert.match(page, /topic\.id === "haha-sim" \? <HahaSimTutorial/);
});

test("redacted screenshots open with the existing in-page image viewer", () => {
  const source = read("components/account/HahaSimTutorial.tsx");
  for (const file of ["haha_iphone_roaming_redacted.webp", "haha_activation_sms_redacted.webp"]) {
    assert.ok(existsSync(new URL(`../../public/tutorials/haha/${file}`, import.meta.url)));
    assert.match(source, new RegExp(file.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(source, /<img|iframe|fetch\(|localStorage/);
  assert.match(read("components/account/TutorialImage.tsx"), /TransformWrapper/);
});

test("historical package examples are not presented as current purchase prices", () => {
  const source = read("components/account/HahaSimTutorial.tsx");
  assert.match(source, /在 haha TRAVEL App 的结算页核对/);
  assert.match(source, /不要将手机号、ICCID 或验证码公开/);
});
