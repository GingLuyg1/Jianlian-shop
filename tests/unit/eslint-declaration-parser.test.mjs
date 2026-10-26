import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {ESLint} from 'eslint';

const cwd=process.cwd();
const candidate=JSON.parse(readFileSync(new URL('../../.eslintrc.json',import.meta.url),'utf8'));
const baseline=new ESLint({cwd,useEslintrc:false,baseConfig:{extends:'next/core-web-vitals'}});
const fixed=new ESLint({cwd});

test('declaration parser override changes no ignore patterns or rule configuration',()=>{
  assert.deepEqual(candidate,{extends:'next/core-web-vitals',overrides:[{files:['**/*.d.mts'],parser:'@typescript-eslint/parser'}]});
});
test('d.mts gets the TypeScript parser while every resolved rule stays identical',async()=>{
  const path=cwd+'/lib/parser-probe.d.mts';const before=await baseline.calculateConfigForFile(path),after=await fixed.calculateConfigForFile(path);
  assert.notEqual(before.parser,after.parser);assert.match(after.parser,/@typescript-eslint[\\/]parser/);
  assert.deepEqual(after.rules,before.rules);assert.deepEqual(after.plugins,before.plugins);assert.deepEqual(after.settings,before.settings);
});
for(const extension of ['ts','tsx','d.ts','js','mjs','mts','cts'])test('unrelated '+extension+' parser and rules are unchanged',async()=>{
  const path=cwd+'/lib/parser-probe.'+extension;const before=await baseline.calculateConfigForFile(path),after=await fixed.calculateConfigForFile(path);
  assert.equal(after.parser,before.parser);assert.deepEqual(after.rules,before.rules);assert.deepEqual(after.ignorePatterns,before.ignorePatterns);
});
test('valid d.mts declaration parses but a malformed declaration still fails',async()=>{
  const filePath=cwd+'/lib/parser-probe.d.mts';
  // Match the actual ambient .d.mts syntax that caused the 16 baseline errors.
  const before=await baseline.lintText('export const value: number;',{filePath});assert.ok(before[0].fatalErrorCount>0);
  const good=await fixed.lintText('export const value: number;',{filePath});assert.equal(good[0].errorCount,0);
  const bad=await fixed.lintText('export const value: ;',{filePath});assert.ok(bad[0].fatalErrorCount>0);
});
test('React hooks violation remains an error in TSX after the parser fix',async()=>{
  const code='import {useState} from "react"; export default function Probe({enabled}) { if (enabled) useState(0); return null; }';
  const options={filePath:cwd+'/components/ParserRuleProbe.tsx'};
  for(const engine of [baseline,fixed]){const [result]=await engine.lintText(code,options);assert.ok(result.messages.some(m=>m.ruleId==='react-hooks/rules-of-hooks'&&m.severity===2))}
});
test('declaration input is not ignored',async()=>assert.equal(await fixed.isPathIgnored(cwd+'/lib/parser-probe.d.mts'),false));
