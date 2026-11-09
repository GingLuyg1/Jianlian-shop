import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
for(const [file,count] of [['AdminSidebar.tsx',3],['AdminTopBar.tsx',2]])test(file+' avoids viewport prefetch for protected navigation while keeping real links',()=>{
 const text=readFileSync(new URL('../../components/admin/'+file,import.meta.url),'utf8');
 const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let checked=0;
 function visit(n){if(ts.isJsxOpeningElement(n)&&n.tagName.getText(tree)==='Link'){
  const attrs=n.attributes.properties,href=attrs.find(a=>a.name?.getText(tree)==='href');
  if(href&&['"/admin"','{child.href}','{item.href}'].includes(href.initializer.getText(tree))){const p=attrs.find(a=>a.name?.getText(tree)==='prefetch');assert.equal(p?.initializer.getText(tree),'{false}');checked++;}
 }ts.forEachChild(n,visit)}visit(tree);assert.equal(checked,count);assert.match(text,/aria-current/);
});
