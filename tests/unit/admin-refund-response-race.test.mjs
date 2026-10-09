import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listPagination } from '../../lib/admin/list-pagination.mjs';
import { loadTs } from '../helpers/payment-session-guard-harness.mjs';

function deferred() { let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}; }
test('actual refund loader ignores a slow old response after a fast filter switch',async()=>{
  const source=readFileSync(new URL('../../app/admin/refunds/page.tsx',import.meta.url),'utf8');
  const block=source.match(/const loadRefunds = useCallback\([\s\S]*?\}, \[query, status, page\]\);/)[0];
  const ref={current:0},state={},pending=[];
  const build=new Function('useCallback','requestVersion','setLoading','setError','setRefunds','setTotal','query','status','page','pageSize','fetch','listPagination',block+'return loadRefunds;');
  const loader=(q,page)=>build(fn=>fn,ref,v=>state.loading=v,v=>state.error=v,v=>state.rows=v,v=>state.total=v,q,'all',page,50,async url=>{const d=deferred();pending.push({url,...d});return d.promise;},listPagination);
  const old=loader('old',1)();const latest=loader('new',2)();
  assert.match(pending[1].url,/page=2/);
  pending[1].resolve(Response.json({refunds:[{id:'new'}],total:101}));await latest;
  pending[0].resolve(Response.json({error:'OLD ERROR'},{status:500}));await old;
  assert.deepEqual(state,{loading:false,error:null,rows:[{id:'new'}],total:101});
  const empty=loader('empty',1)();pending[2].resolve(Response.json({refunds:[],total:0}));await empty;assert.deepEqual(state.rows,[]);assert.equal(state.total,0);
  const error=loader('error',1)();pending[3].resolve(Response.json({error:'SAFE ERROR'},{status:503}));await error;
  assert.equal(state.error,'SAFE ERROR');assert.equal(state.total,0);assert.equal(state.loading,false);
});
test('actual global inventory search returns import_status and no card content',async()=>{
  const search=loadTs('lib/admin/global-search.ts',{'@/lib/business/business-ids':{normalizeBusinessKeyword:v=>v,isUuid:()=>false,isLikelyBusinessNo:()=>false}});
  const c={from(table){const q={select(columns){if(table==='digital_inventory_batches')assert.equal(columns,'id,batch_no,batch_name,import_status,total_count,available_count,created_at');return q;},or(){return q;},order(){return q;},limit(){return q;},in(){return q;},
    then(ok,bad){return Promise.resolve({data:table==='digital_inventory_batches'?[{id:'x',batch_no:'B_TEST',import_status:'completed',available_count:0,total_count:2}]:[],error:null}).then(ok,bad);}};return q;}};
  const result=await search.runAdminGlobalSearch(c,'B_TEST');const inventory=result.groups.find(g=>g.group==='inventory');
  assert.equal(inventory.results[0].status,'completed');assert.equal(inventory.results[0].subtitle,'可用 0 / 总计 2');assert.equal(inventory.error,undefined);
});
