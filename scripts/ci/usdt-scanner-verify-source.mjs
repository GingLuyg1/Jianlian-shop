import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const manifest=JSON.parse(fs.readFileSync('/checks/usdt-scanner-source-manifest.json','utf8'));
const kind=process.argv[2],files=kind==='candidate'?manifest.candidate:manifest.rollback;
const checks=[];
for(const entry of [...files,...manifest.protected]){
  let bytes=fs.readFileSync(entry.file);if(entry.canonicalLf)bytes=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.file);
  checks.push(entry.file);
}
assert.equal(manifest.productionBase,'4575d802d653e4dca726427bce826aa68c93d9e2');
console.log(JSON.stringify({kind,verified:checks,productionBase:manifest.productionBase,sourceOnly:true,databaseSqlExecuted:false},null,2));
