import fs from 'node:fs';
import cp from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function readinessStatus({app,worker,service,timer,release,pm2,authConsistent,permissions,unitMatches,channelsSafe,health}) {
  const literal=v=>v==='true'?'true':v===undefined?'missing':v==='false'?'false':'invalid';
  const liveExact=/^\/www\/releases\/jianlian-shop-[0-9a-f]{40}$/.test(release??'')
    && pm2.status==='online' && pm2.cwd===release && pm2.procCwd===release
    && pm2.script===release+'/node_modules/next/dist/bin/next';
  const ready=app===true && worker.SNPAY_RECONCILIATION_ENABLED==='true'
    && worker.SNPAY_RECONCILIATION_EXECUTE_ENABLED==='true' && authConsistent && permissions
    && unitMatches && liveExact && service.LoadState==='loaded' && service.ActiveState==='inactive'
    && !service.DropInPaths && !timer.DropInPaths && timer.LoadState==='loaded'
    && timer.UnitFileState==='disabled' && timer.ActiveState==='inactive' && channelsSafe && health;
  return {APP_GATE:app===true?'true':app===false?'false':'unknown',
    WORKER_MASTER_GATE:literal(worker.SNPAY_RECONCILIATION_ENABLED),WORKER_EXECUTE_GATE:literal(worker.SNPAY_RECONCILIATION_EXECUTE_ENABLED),
    SERVICE_INSTALLED:service.LoadState==='loaded'?'yes':'no',SERVICE_ACTIVE:service.ActiveState??'unknown',
    TIMER_ENABLED:timer.UnitFileState==='disabled'?'no':timer.UnitFileState==='enabled'?'yes':'unknown',TIMER_ACTIVE:timer.ActiveState??'unknown',
    ACTIVE_APP_SHA:liveExact?release.slice(-40):'unknown',PM2_CWD:liveExact?release:'unverified',
    CHANNELS:channelsSafe?'alipay=false;wechat=false;usdt_bep20=true':'unsafe_or_unknown',
    AUTH_CONSISTENT:authConsistent?'yes':'no',CONFIG_PERMISSIONS:permissions?'pass':'fail',
    SYSTEMD_RELEASE_MATCH:unitMatches?'yes':'no',HEALTH_200:health?'yes':'no',READY_FOR_EXECUTE:ready?'yes':'no'};
}

export function parseConfig(text) {
  const entries={};
  for(const line of text.split(/\r?\n/)){
    if(!line.trim()||line.startsWith('#'))continue;
    const m=line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);if(!m||Object.hasOwn(entries,m[1]))throw Error('CONFIG_INVALID');
    entries[m[1]]=m[2];
  }
  return entries;
}
const run=(command,args)=>{
  const r=cp.spawnSync(command,args,{encoding:'utf8',timeout:10000,env:{...process.env,PM2_HOME:'/root/.pm2'},stdio:['ignore','pipe','pipe']});
  if(r.status!==0)throw Error('READINESS_COMMAND_FAILED');return r.stdout;
};
export async function inspectReadiness() {
  if(process.platform!=='linux'||process.getuid()!==0)throw Error('ROOT_LINUX_REQUIRED');
  // pm2 jlist may start a daemon if absent. Never allow this read-only tool to do so.
  const daemonPid=fs.readFileSync('/root/.pm2/pm2.pid','utf8').trim();
  if(!/^\d+$/.test(daemonPid))throw Error('PM2_DAEMON_UNKNOWN');process.kill(Number(daemonPid),0);
  if(!fs.statSync('/root/.pm2/rpc.sock').isSocket()
    ||!fs.readFileSync('/proc/'+daemonPid+'/cmdline','utf8').includes('God Daemon'))throw Error('PM2_DAEMON_UNVERIFIED');
  const p=JSON.parse(run('pm2',['jlist'])).find(x=>x.name==='jianlian-shop');if(!p)throw Error('APP_MISSING');
  const release=p.pm2_env.pm_cwd;
  if(!/^\/www\/releases\/jianlian-shop-[0-9a-f]{40}$/.test(release))throw Error('RELEASE_INVALID');
  const pm2={status:p.pm2_env.status,cwd:release,script:p.pm2_env.pm_exec_path,procCwd:fs.realpathSync('/proc/'+p.pid+'/cwd')};
  const cfgPath='/etc/jianlian/snpay-reconciliation.env',st=fs.lstatSync(cfgPath);
  const permissions=st.isFile()&&!st.isSymbolicLink()&&st.uid===0&&st.gid===0&&(st.mode&0o777)===0o600;
  if(!permissions)throw Error('WORKER_CONFIG_UNSAFE');
  const worker=parseConfig(fs.readFileSync(cfgPath,'utf8'));
  // Reproduce release env loading in this helper, not in the running app. GET
  // below is the independent evidence of the actual app process runtime gate.
  const {createRequire}=await import('node:module');
  const loader=createRequire(release+'/package.json')('@next/env');
  const {combinedEnv}=loader.loadEnvConfig(release,false,{info(){},error(){}},true);
  const workerSecret=(worker.PAYMENT_RECONCILIATION_SECRET??combinedEnv.PAYMENT_RECONCILIATION_SECRET)
    ??(worker.INTERNAL_API_SECRET??combinedEnv.INTERNAL_API_SECRET);
  const authSecret=p.pm2_env.PAYMENT_RECONCILIATION_SECRET??combinedEnv.PAYMENT_RECONCILIATION_SECRET
    ??p.pm2_env.INTERNAL_API_SECRET??combinedEnv.INTERNAL_API_SECRET;
  const base=new URL(worker.JIANLIAN_INTERNAL_BASE_URL??'');
  if(base.origin!=='http://127.0.0.1:3001'||base.pathname!=='/'||base.username||base.password||base.search||base.hash)throw Error('INTERNAL_URL_INVALID');
  let app=null;
  if(authSecret){const r=await fetch(new URL('/api/internal/payments/snpay-reconciliation',base),{
    method:'GET',headers:{'x-payment-reconciliation-secret':authSecret},redirect:'error',signal:AbortSignal.timeout(5000)});
    if(r.ok){const data=await r.json();if(typeof data.executeEnabled==='boolean')app=data.executeEnabled;}else await r.body?.cancel();}
  const show=type=>Object.fromEntries(run('systemctl',['show','jianlian-snpay-reconciliation.'+type,'-p','LoadState','-p','ActiveState','-p','UnitFileState','-p','DropInPaths']).trim().split('\n').map(l=>l.split('=')));
  const service=show('service'),timer=show('timer');
  const unitMatches=worker.JIANLIAN_RELEASE_DIR===release && worker.JIANLIAN_NODE_PATH==='/usr/bin/node'
    && ['service','timer'].every(type=>fs.existsSync('/etc/systemd/system/jianlian-snpay-reconciliation.'+type)
      && fs.readFileSync('/etc/systemd/system/jianlian-snpay-reconciliation.'+type).equals(fs.readFileSync(release+'/ops/systemd/jianlian-snpay-reconciliation.'+type)));
  const channelResponse=await fetch(new URL('/api/recharges/channels',base),{redirect:'error',signal:AbortSignal.timeout(5000)});
  let channelsSafe=false;
  if(channelResponse.ok){const payload=await channelResponse.json();const channels=Array.isArray(payload)?payload:payload.channels??payload.data;
    if(Array.isArray(channels)){const codes=channels.map(x=>x.channel??x.code);channelsSafe=!codes.includes('alipay')&&!codes.includes('wechat')&&codes.includes('usdt_bep20');}}
  else await channelResponse.body?.cancel();
  const dbBase=new URL(combinedEnv.NEXT_PUBLIC_SUPABASE_URL??'');
  if(dbBase.origin!=='https://qvbovrvybirscaurwuov.supabase.co')throw Error('DB_PROJECT_INVALID');
  const dbKey=combinedEnv.SUPABASE_SECRET_KEY??combinedEnv.SUPABASE_SERVICE_ROLE_KEY;
  if(!dbKey)throw Error('DB_READ_CONFIG_MISSING');
  const dbResponse=await fetch(new URL('/rest/v1/payment_channels?channel=in.(alipay,wechat,usdt_bep20)&select=channel,enabled',dbBase),{
    headers:{apikey:dbKey,'User-Agent':'Jianlian-SNPAY-Readiness/1.0'},redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!dbResponse.ok){await dbResponse.body?.cancel();throw Error('CHANNEL_READ_FAILED');}
  const rows=await dbResponse.json();
  channelsSafe=channelsSafe&&Array.isArray(rows)&&rows.length===3
    &&rows.find(x=>x.channel==='alipay')?.enabled===false&&rows.find(x=>x.channel==='wechat')?.enabled===false
    &&rows.find(x=>x.channel==='usdt_bep20')?.enabled===true;
  const h=await fetch(new URL('/api/health',base),{redirect:'error',signal:AbortSignal.timeout(5000)});await h.body?.cancel();
  return readinessStatus({app,worker,service,timer,release,pm2,authConsistent:Boolean(authSecret)&&authSecret===workerSecret,permissions,unitMatches,channelsSafe,health:h.status===200});
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{const status=await inspectReadiness();for(const[k,v]of Object.entries(status))console.log(k+'='+v);if(status.READY_FOR_EXECUTE!=='yes')process.exitCode=1;}
  catch{console.log('READY_FOR_EXECUTE=no\nBLOCKER=READINESS_UNVERIFIED');process.exitCode=1;}
}
