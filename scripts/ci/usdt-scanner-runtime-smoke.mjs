import assert from 'node:assert/strict';
const checks=[],kind=process.argv[2],url='http://127.0.0.1:3207';
let health;
for(let attempt=0;attempt<30;attempt++){
  try{health=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1000)});if(health.ok)break;}catch{}
  await new Promise(r=>setTimeout(r,500));
}
assert.equal(health?.status,200);assert.equal((await health.json()).status,'ok');checks.push('PRODUCTION_BUILD_LOOPBACK_HEALTH_200');
for(const method of ['GET','POST']){
  const r=await fetch(url+'/api/internal/recharges/bep20/scan',{method,signal:AbortSignal.timeout(5000)});
  assert.equal(r.status,401);checks.push('UNAUTHENTICATED_'+method+'_DENIED_BEFORE_SCANNER');
}
if(kind==='rollback'){
  const r=await fetch(url+'/api/internal/recharges/bep20/scan',{headers:{'x-internal-job-secret':'synthetic-build-only-job-secret'},signal:AbortSignal.timeout(5000)});
  assert.equal(r.status,503);assert.equal((await r.json()).code,'RECHARGE_SCANNER_ROLLBACK_CONTAINED');checks.push('ROLLBACK_ROUTE_HARD_CONTAINMENT_NO_LEGACY_SCAN');
}
console.log(JSON.stringify({kind,checks,passed:checks.length,network:'CONTAINER_NONE_LOOPBACK_ONLY',realDatabase:false,productionWrites:false},null,2));
