#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {runSnpayReconciliationWatcher} from '../../lib/payments/snpay-reconciliation-watcher.mjs';
const lock='/run/lock/jianlian-snpay-reconciliation.lock';
const state='/run/jianlian-snpay-reconciliation/heartbeat.json';
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const args=process.argv.slice(2);
  if(!args.includes('--watcher-lock-held')){
    const p=spawnSync('/usr/bin/flock',['-n','-E','0',lock,process.execPath,process.argv[1],'--watcher-lock-held',...args],{stdio:'inherit'});
    process.exitCode=p.error?1:p.status??1;
  }else{
    createRequire(import.meta.url)('@next/env').loadEnvConfig(fileURLToPath(new URL('../../',import.meta.url)),false,{info(){},error(){}});
    const result=await runSnpayReconciliationWatcher({args,write:line=>process.stdout.write(line+'\n'),heartbeat:async value=>{
      let previous={};try{previous=JSON.parse(readFileSync(state,'utf8'));}catch{}
      const tmp=state+'.tmp';writeFileSync(tmp,JSON.stringify({...value,last_successful_run:value.last_successful_run??previous.last_successful_run??null}),{mode:0o600});renameSync(tmp,state);
    }});if(!['finished','disabled'].includes(result.status))process.exitCode=1;
  }
}
