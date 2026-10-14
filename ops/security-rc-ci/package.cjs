// Runner-only packaging. Never copies credentials or the working tree into a release.
const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');const crypto=require('node:crypto');
const [rootArg,outArg,label,expectedNext,commit,nodePath]=process.argv.slice(2);
if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true')throw Error('Isolated Linux Actions runner required');
const root=path.resolve(rootArg),out=path.resolve(outArg);
if(!/^(legacy|rc-webpack|rc-turbopack)$/.test(label)||!['13.5.1','16.4.1'].includes(expectedNext)||!/^[a-f0-9]{40}$/.test(commit))throw Error('Invalid pinned package parameters');
if(!out.startsWith(path.resolve(process.env.RUNNER_TEMP)+path.sep))throw Error('Output must be under RUNNER_TEMP');
const version=JSON.parse(fs.readFileSync(path.join(root,'node_modules/next/package.json'))).version;
if(version!==expectedNext)throw Error('Actual Next mismatch');
const source=path.join(root,'.next/standalone');if(!fs.existsSync(path.join(source,'server.js')))throw Error('Standalone server root missing');
fs.mkdirSync(out,{recursive:true});const target=path.join(out,label);
if(fs.existsSync(target))throw Error('Never overwrite an existing package');
fs.cpSync(source,target,{recursive:true});
fs.cpSync(path.join(root,'.next/static'),path.join(target,'.next/static'),{recursive:true});
fs.cpSync(path.join(root,'public'),path.join(target,'public'),{recursive:true});
function audit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(/^\.env(?:\.|$)/.test(e.name)||/\.(?:pem|p12|pfx)$/.test(e.name))throw Error('Forbidden configuration/key in package');if(e.isDirectory())audit(p);}}
audit(target);
const manifest={label,sourceCommit:commit,rcBase:'675b9a1979cb0e9411b1edf48f2ee5e8fd93b977',ciPackagingAdapter:label==='legacy'?'Only next.config.js output=standalone; original application and lockfile unchanged':'none',next:version,react:JSON.parse(fs.readFileSync(path.join(root,'node_modules/react/package.json'))).version,node:process.version,nodeInterpreter:nodePath,platform:process.platform,arch:process.arch,buildId:fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim()};
fs.writeFileSync(path.join(target,'ci-build-manifest.json'),JSON.stringify(manifest,null,2));
const archive=path.join(out,label+'.tar.gz');cp.execFileSync('tar',['-C',out,'-czf',archive,label]);
const sha=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
fs.writeFileSync(archive+'.sha256',`${sha}  ${label}.tar.gz\n`);fs.writeFileSync(path.join(out,label+'.manifest.json'),JSON.stringify({...manifest,archiveSha256:sha},null,2));
console.log(JSON.stringify({...manifest,archiveSha256:sha,archiveBytes:fs.statSync(archive).size}));
