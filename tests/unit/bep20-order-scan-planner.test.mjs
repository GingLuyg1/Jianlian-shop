import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const module={exports:{}};
new Function("require","module","exports",ts.transpileModule(fs.readFileSync("lib/recharges/bep20-order-scan-planner.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{assert.equal(n,"server-only");return{};},module,module.exports);
const {planOrderScanRanges}=module.exports;
const head=130000000n,time=1800000000;
const iso=n=>new Date(n*1000).toISOString();
const window=(id,start,progress=null)=>({id,created_at:iso(start),expires_at:iso(start+900),last_scanned_block:progress});
const headers=[];
const read=async n=>{headers.push(n);return{timestamp:time+Number(n-head),hash:"synthetic"};};
test("recent order bracketing never jumps halfway back to genesis",async()=>{
 headers.length=0;const ranges=await planOrderScanRanges([window("a",time-899)],head,read);
 assert.equal(ranges[0].from,head-899n);assert.equal(ranges[0].to,head);
 assert.ok(headers.every(n=>n>=head-2048n));
});
test("confirmed expiry includes exactly first boundary after deadline",async()=>{
 const ranges=await planOrderScanRanges([window("a",time-1000)],head,read);
 assert.equal(ranges[0].to,head-99n);assert.equal(ranges[0].windows[0].complete,true);
});
test("overlapping order ranges merge and keep independent durable progress",async()=>{
 const ranges=await planOrderScanRanges([window("a",time-800,(head-200n).toString()),window("b",time-700)],head,read);
 assert.equal(ranges.length,1);assert.equal(ranges[0].from,head-700n);assert.equal(ranges[0].windows.length,2);
});
test("future and already scanned windows require no log range",async()=>{
 assert.equal((await planOrderScanRanges([window("a",time+10)],head,read)).length,0);
 assert.equal((await planOrderScanRanges([window("b",time-1000,(head-99n).toString())],head,read)).length,0);
});
test("invalid expiry is not silently widened",async()=>{
 await assert.rejects(planOrderScanRanges([{...window("a",time-100),expires_at:iso(time+1800)}],head,read),/WINDOW_INVALID/);
});
