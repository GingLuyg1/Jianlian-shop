// Cache real Google Inter CSS/font bytes before the network-disabled build.
// Next 13's upstream response-file hook is used ONLY as an offline asset cache;
// every font URL becomes an absolute path to a verified real WOFF2, never fake bytes.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const cache='/work/font-cache',manifestPath=cache+'/manifest.json';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(process.argv[2]==='--verify'){
 const m=JSON.parse(fs.readFileSync(manifestPath));
 for(const f of m.fonts)assert.equal(sha(fs.readFileSync(f.path)),f.sha256);
 assert.equal(sha(fs.readFileSync(cache+'/responses.cjs')),m.responseSHA256);
 console.log('REAL_OFFICIAL_FONT_CACHE_VERIFIED');
}else{
 fs.mkdirSync(cache,{mode:0o700});
 const url='https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap';
 const cssResponse=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36'},redirect:'error',signal:AbortSignal.timeout(20000)});
 assert.equal(cssResponse.status,200);const original=await cssResponse.text();
 assert.ok(original.length<262144&&original.includes("font-family: 'Inter'")&&original.includes('font-display: swap'));
 const urls=[...new Set([...original.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m=>m[1]))];
 assert.ok(urls.length>0&&urls.length<=16);let css=original;const fonts=[];
 for(const source of urls){const u=new URL(source);assert.equal(u.origin,'https://fonts.gstatic.com');assert.ok(u.pathname.startsWith('/s/inter/'));const r=await fetch(source,{redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.ok(bytes.length>1000&&bytes.length<1048576);assert.equal(bytes.subarray(0,4).toString(),'wOF2');const hash=sha(bytes),path=cache+'/'+hash+'.woff2';fs.writeFileSync(path,bytes,{flag:'wx'});fonts.push({source,path,sha256:hash,bytes:bytes.length});css=css.split(source).join(path);}
 assert.ok(!/https?:\/\//.test(css));
 const response='module.exports='+JSON.stringify({[url]:css})+';\n';fs.writeFileSync(cache+'/responses.cjs',response,{flag:'wx'});
 const m={url,cssSHA256:sha(original),responseSHA256:sha(response),fonts,source:'OFFICIAL_TLS_GOOGLE_FONTS_REAL_ASSETS',fakeFontBytes:false,uiSourceChanged:false};
 fs.writeFileSync(manifestPath,JSON.stringify(m,null,2),{flag:'wx'});
 fs.writeFileSync('/work/out/font-provenance.json',JSON.stringify(m,null,2),{flag:'wx'});
 console.log('REAL_OFFICIAL_FONT_CACHE_PREPARED='+fonts.length);
}
