import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('Giffgaff is a distinct searchable topic in existing tutorial UI',()=>{
 const page=read('app/tutorials/page.tsx');assert.match(page,/id: "giffgaff", label: "Giffgaff", title: "Giffgaff 保号助手"/);
 assert.match(page,/topic\.id === "giffgaff" \? <GiffgaffTutorial/);
 assert.match(read('components/account/TutorialsGlass.module.css'),/data-topic=giffgaff/);
});
test('helper is opt-in external navigation, with no embedded download or SIM action',()=>{
 const source=read('components/account/GiffgaffTutorial.tsx');assert.match(source,/https:\/\/gg\.zote\.eu\.org\//);
 assert.match(source,/noopener noreferrer/);assert.doesNotMatch(source,/fetch\(|iframe|useEffect|setInterval|localStorage/);
 assert.match(source,/不会自动下载/);assert.match(source,/只代表它的下载流程结束/);
});
test('fees and activity distinguish official rules from unverified tool claims',()=>{
 const source=read('components/account/GiffgaffTutorial.tsx');for(const text of ['至少每 6 个月','未独立测量','不是每次固定扣费承诺','未独立审计','2.46 便士'])assert.ok(source.includes(text));
 assert.match(source,/help\.giffgaff\.com/);assert.match(source,/www\.giffgaff\.com\/roaming\/china/);
});
