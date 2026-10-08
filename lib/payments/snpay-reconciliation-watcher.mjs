import {SNPAY_RECONCILIATION as config,snpayCandidateReason} from './snpay-reconciliation-policy.mjs';
export function snpayExecutionEnabled(args,env) {
  return args.includes('--execute') && env.SNPAY_RECONCILIATION_EXECUTE_ENABLED === 'true';
}
export async function runSnpayReconciliationWatcher({env=process.env,args=[],fetchImpl=fetch,nowMs=Date.now(),write=()=>{},heartbeat=async()=>{}}={}) {
  const start=Date.now(),execute=snpayExecutionEnabled(args,env);
  const summary={event:'snpay_reconciliation',mode:execute?'execute':'dry_run',checked:0,paid:0,completed:0,unpaid:0,manual_review:0,query_error:0,skipped:0,duration_ms:0,status:'finished'};
  const finish=async()=>{summary.duration_ms=Date.now()-start;write(JSON.stringify(summary));await heartbeat({...summary,finished_at:new Date().toISOString(),last_successful_run:summary.status==='finished'?new Date().toISOString():null});return summary;};
  if(env.SNPAY_RECONCILIATION_ENABLED !== 'true'){summary.status='disabled';return finish();}
  if(args.includes('--execute')&&!execute){summary.status='execute_not_enabled';return finish();}
  try {
    const base=new URL(env.NEXT_PUBLIC_SUPABASE_URL),internal=new URL(env.JIANLIAN_INTERNAL_BASE_URL);
    const key=env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY,secret=env.PAYMENT_RECONCILIATION_SECRET ?? env.INTERNAL_API_SECRET;
    if(base.protocol!=='https:'||base.username||base.password||!key||!secret
        || !['localhost','127.0.0.1','[::1]'].includes(internal.hostname)||!['http:','https:'].includes(internal.protocol)||internal.username||internal.password)throw Error('configuration');
    const url=new URL('/rest/v1/payment_sessions',base);
    for(const[k,v]of Object.entries({select:'id,session_no,business_type,channel_code,provider,provider_order_no,currency,payable_amount,status,created_at,expires_at,last_synced_at',
      provider:'eq.snpay',channel_code:'in.(alipay,wechat)',business_type:'in.(recharge,account_recharge)',currency:'eq.CNY',status:'in.(pending,processing,expired)',
      order:'last_synced_at.asc.nullsfirst,created_at.asc,id.asc',limit:'40',
      or:`(and(status.in.(pending,processing),or(last_synced_at.is.null,last_synced_at.lte.${new Date(nowMs-config.pendingCadenceMs).toISOString()})),and(status.eq.expired,or(last_synced_at.is.null,last_synced_at.lte.${new Date(nowMs-config.expiredCadenceMs).toISOString()})))`}))url.searchParams.set(k,v);
    url.searchParams.append('created_at','gte.'+new Date(nowMs-config.lookbackMs).toISOString());
    url.searchParams.append('created_at','lte.'+new Date(nowMs-config.minimumAgeMs).toISOString());
    const response=await fetchImpl(url,{headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{})},signal:AbortSignal.timeout(4000)});
    if(!response.ok)throw Error('read');const rows=await response.json();if(!Array.isArray(rows)||rows.length>40)throw Error('read');
    const seen=new Set();
    for(const s of rows){
      if(summary.checked>=config.batchSize || Date.now()-start>config.batchTimeoutMs-10000 || summary.query_error>=2)break;
      if(!/^[0-9a-f-]{36}$/i.test(s.id??'')||seen.has(s.id)||snpayCandidateReason(s,nowMs)){summary.skipped++;continue;}
      seen.add(s.id);
      const r=await fetchImpl(new URL('/api/internal/payments/snpay-reconciliation',internal),{method:'POST',headers:{'content-type':'application/json','x-payment-reconciliation-secret':secret},body:JSON.stringify({sessionId:s.id,execute}),signal:AbortSignal.timeout(10000)});
      if(!r.ok){summary.query_error++;summary.status='partial_failure';continue;}
      const result=await r.json();summary.checked++;
      if(result.queried&&result.paid)summary.paid++;
      if(result.completed)summary.completed++;
      if(result.kind==='unpaid')summary.unpaid++;
      if(result.kind==='manual_review')summary.manual_review++;
      if(result.kind==='skipped')summary.skipped++;
      if(result.kind==='query_error'){summary.query_error++;summary.status='partial_failure';}
    }
  }catch{summary.status='partial_failure';summary.query_error++;}
  return finish();
}
