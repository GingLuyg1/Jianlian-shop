import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../../components/products/catalog-selection-motion.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};
new Function('exports',code)(mod.exports);
const {updateCatalogPointer,clearCatalogPointer}=mod.exports;

function fixture(overrides={}) {
  const writes=[];
  const target={disabled:false,dataset:new Proxy({}, {set(object,key,value){writes.push([key,value]);object[key]=value;return true}}),getBoundingClientRect:()=>({left:100,top:40,width:1000,height:80}),...overrides};
  const move=(x,y=80,pointerType='mouse')=>updateCatalogPointer({currentTarget:target,clientX:x,clientY:y,pointerType});
  return {target,writes,move};
}
test('center activates title, edge/leave resets it without changing selection or geometry',()=>{
  const f=fixture();f.move(600);assert.equal(f.target.dataset.cardCenter,'true');
  f.move(108);assert.equal(f.target.dataset.cardCenter,'false');
  f.move(600);clearCatalogPointer({currentTarget:f.target});assert.equal(f.target.dataset.cardCenter,undefined);
  assert.deepEqual(Object.keys(f.target.dataset),[]);assert.equal(f.target.disabled,false);
});
test('repeated movement within the center does not repeatedly mutate the DOM',()=>{
  const f=fixture();for(let x=480;x<680;x++)f.move(x);
  assert.deepEqual(f.writes,[['cardCenter','true']]);
});
test('disabled, touch and unmeasurable cards have no hover state mutations',()=>{
  const disabled=fixture({disabled:true});disabled.move(600);assert.deepEqual(disabled.writes,[]);
  const touch=fixture();touch.move(600,80,'touch');assert.deepEqual(touch.writes,[]);
  const hidden=fixture({getBoundingClientRect:()=>({width:0,height:0})});hidden.move(600);assert.deepEqual(hidden.writes,[]);
});
