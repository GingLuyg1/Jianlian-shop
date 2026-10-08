import {SNPAY_RECONCILIATION as config,snpayCandidateReason} from './snpay-reconciliation-policy.mjs';
export function snpayExecutionEnabled(args,env) {
  return args.includes('--execute') && env.SNPAY_RECONCILIATION_EXECUTE_ENABLED === 'true';
}
export async function runSnpayReconciliationWatcher({env=process.env,args=[],fetchImpl=fetch,nowMs=Date.now(),write=()=>{},heartbeat=async()=>{},scanCursor=null}={}) {
  const start=Date.now(),execute=snpayExecutionEnabled(args,env);
  const summary={event:'snpay_reconciliation',mode:execute?'execute':'dry_run',checked:0,paid:0,completed:0,unpaid:0,manual_review:0,query_error:0,skipped:0,scanned:0,eligible:0,processed:0,skipped_invalid:0,provider_queries:0,resolved:0,errors:0,error_count:0,remaining:null,progress_made:false,stop_reason:'empty',duration_ms:0,status:'finished'};
  const validCursor=c=>c&&/^[0-9a-f-]{36}$/i.test(c.id??'')&&Number.isFinite(Date.parse(c.created_at));
  let cursor=validCursor(scanCursor)?{id:scanCursor.id,created_at:new Date(scanCursor.created_at).toISOString()}:null;
  const finish=async()=>{summary.errors=summary.error_count=summary.query_error;summary.progress_made=summary.provider_queries>0||summary.resolved>0;
    if(summary.status==='finished'&&summary.scanned>0&&!summary.progress_made){summary.status='no_progress';if(['empty','exhausted'].includes(summary.stop_reason))summary.stop_reason='no_effective_candidates';}
    summary.duration_ms=Date.now()-start;write(JSON.stringify(summary));await heartbeat({...summary,scan_cursor:cursor,finished_at:new Date().toISOString(),last_successful_run:summary.status==='finished'?new Date().toISOString():null});return summary;};
  if(env.SNPAY_RECONCILIATION_ENABLED !== 'true'){summary.status='disabled';return finish();}
  if(args.includes('--execute')&&!execute){summary.status='execute_not_enabled';return finish();}
  try {
    const base=new URL(env.NEXT_PUBLIC_SUPABASE_URL),internal=new URL(env.JIANLIAN_INTERNAL_BASE_URL);
    const key=env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY,secret=env.PAYMENT_RECONCILIATION_SECRET ?? env.INTERNAL_API_SECRET;
    if(base.protocol!=='https:'||base.username||base.password||!key||!secret
        || !['localhost','127.0.0.1','[::1]'].includes(internal.hostname)||!['http:','https:'].includes(internal.protocol)||internal.username||internal.password)throw Error('configuration');
    // Authenticate before reading sensitive candidates. Old/mismatched app
    // releases (405), invalid credentials and closed app execute gates fail
    // closed before any scan. This GET cannot query or complete a payment.
    const admission=await fetchImpl(new URL('/api/internal/payments/snpay-reconciliation',internal),{
      method:'GET',headers:{'x-payment-reconciliation-secret':secret},signal:AbortSignal.timeout(4000)});
    if(!admission.ok)throw Error('admission');
    const gate=await admission.json();
    if(typeof gate.executeEnabled!=='boolean'||(execute&&gate.executeEnabled!==true))throw Error('admission');
    const url=new URL('/rest/v1/payment_sessions',base);
    for(const[k,v]of Object.entries({select:'id,session_no,business_type,channel_code,provider,provider_order_no,currency,payable_amount,status,created_at,expires_at,last_synced_at',
      provider:'eq.snpay',channel_code:'in.(alipay,wechat)',business_type:'in.(recharge,account_recharge)',currency:'eq.CNY',status:'in.(pending,processing,expired)',
      order:'created_at.asc,id.asc',limit:'40',provider_order_no:'not.is.null',session_no:'not.is.null',payable_amount:'gt.0',expires_at:'not.is.null',
      or:`(and(status.in.(pending,processing),or(last_synced_at.is.null,last_synced_at.lte.${new Date(nowMs-config.pendingCadenceMs).toISOString()})),and(status.eq.expired,or(last_synced_at.is.null,last_synced_at.lte.${new Date(nowMs-config.expiredCadenceMs).toISOString()})))`}))url.searchParams.set(k,v);
    url.searchParams.append('created_at','gte.'+new Date(nowMs-config.lookbackMs).toISOString());
    url.searchParams.append('created_at','lte.'+new Date(nowMs-config.minimumAgeMs).toISOString());
    url.searchParams.append('provider_order_no','neq.');url.searchParams.append('session_no','neq.');
    const seen=new Set();let dispatched=0,stopped=false;
    // At most four 40-row pages. Persist the last inspected key, so even an
    // arbitrarily long invalid prefix cannot restart the scan forever.
    for(let page=0;page<4&&!stopped;page++){
    if(cursor)url.searchParams.set('and',`(or(created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})))`);else url.searchParams.delete('and');
    if(Date.now()-start>config.batchTimeoutMs-10000){summary.stop_reason='time_budget';summary.remaining=true;break;}
    const response=await fetchImpl(url,{headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{})},signal:AbortSignal.timeout(4000)});
    if(!response.ok)throw Error('read');const rows=await response.json();if(!Array.isArray(rows)||rows.length>40)throw Error('read');
    if(rows.length===0){cursor=null;summary.remaining=false;summary.stop_reason=summary.scanned?'exhausted':'empty';break;}
    for(const s of rows){
      if(dispatched>=config.batchSize || Date.now()-start>config.batchTimeoutMs-10000 || summary.query_error>=2){summary.stop_reason=summary.query_error>=2?'error_guard':dispatched>=config.batchSize?'batch_limit':'time_budget';summary.remaining=true;stopped=true;break;}
      summary.scanned++;
      if(!validCursor(s)||seen.has(s.id))throw Error('invalid_scan_key');
      cursor={id:s.id,created_at:new Date(s.created_at).toISOString()};
      seen.add(s.id);
      if(snpayCandidateReason(s,nowMs)){summary.skipped++;summary.skipped_invalid++;continue;}
      summary.eligible++;dispatched++;
      const r=await fetchImpl(new URL('/api/internal/payments/snpay-reconciliation',internal),{method:'POST',headers:{'content-type':'application/json','x-payment-reconciliation-secret':secret},body:JSON.stringify({sessionId:s.id,execute}),signal:AbortSignal.timeout(10000)});
      if(!r.ok){summary.query_error++;summary.status='partial_failure';continue;}
      const result=await r.json();summary.checked++;summary.processed++;
      if(result.queried)summary.provider_queries++;
      if(result.queried&&result.paid)summary.paid++;
      if(result.completed){summary.completed++;summary.resolved++;}
      if(result.kind==='unpaid')summary.unpaid++;
      if(result.kind==='manual_review')summary.manual_review++;
      if(result.kind==='skipped')summary.skipped++;
      if(result.kind==='query_error'){summary.query_error++;summary.status='partial_failure';}
    }
    if(!stopped&&rows.length<40){cursor=null;summary.remaining=false;summary.stop_reason='exhausted';break;}
    if(!stopped){summary.stop_reason='scan_limit';summary.remaining=true;}
    }
    if(summary.query_error>=2)summary.stop_reason='error_guard';
  }catch{summary.status='partial_failure';summary.stop_reason='error';summary.query_error++;}
  return finish();
}
