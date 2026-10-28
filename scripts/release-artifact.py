#!/usr/bin/env python3
"""Fail-closed verifier/extractor for an explicitly approved immutable CI artifact."""
import argparse, base64, hashlib, json, os, platform, posixpath, re, stat, subprocess, sys, tarfile
from pathlib import Path

class Blocked(Exception): pass
def need(ok, code):
    if not ok: raise Blocked(code)
def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1048576),b''): h.update(b)
    return h.hexdigest()
def git(repo,*args):
    return subprocess.check_output(['git','-C',str(repo),*args],stderr=subprocess.DEVNULL)
def full(value): need(bool(re.fullmatch('[0-9a-f]{40}',value)), 'FULL_SHA_REQUIRED')
def name(raw):
    while raw.startswith('./'): raw=raw[2:]
    need('\\' not in raw and not raw.startswith('/') and not re.match('^[A-Za-z]:',raw), 'UNSAFE_PATH')
    need(all(x not in ('','..') for x in raw.split('/')), 'UNSAFE_PATH')
    return raw.rstrip('/')
def skipped(path):
    return path.startswith(('.github/','scripts/ci/','tests/')) or any(p.startswith('.env') for p in path.split('/'))
def tree(repo,sha):
    result={}
    for line in git(repo,'ls-tree','-rz','--full-tree',sha).split(b'\0'):
        if not line: continue
        spec,p=line.split(b'\t',1); mode,kind,oid=spec.decode().split()
        path=p.decode('utf-8')
        need(kind=='blob', 'GIT_SUBMODULE_NOT_SUPPORTED')
        if not skipped(path): result[path]=(mode,oid)
    return result
def blob(data): return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
def secrets(data):
    need(not re.search(rb'-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{40}',data), 'PRIVATE_KEY_IN_ARTIFACT')
    for token in re.findall(rb'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',data):
        try: payload=json.loads(base64.urlsafe_b64decode(token.split(b'.')[1]+b'==='))
        except (ValueError,UnicodeError): continue
        need(payload.get('role')!='service_role','PRIVILEGED_JWT_IN_ARTIFACT')
    need(not re.search(rb'sb_secret_[A-Za-z0-9_-]{24,}',data), 'SERVER_SECRET_IN_ARTIFACT')
def verify(args, extract=False):
    full(args.sha); full(args.required_main)
    need(git(args.repo,'rev-parse',args.sha).decode().strip()==args.sha, 'SOURCE_SHA_MISMATCH')
    need(subprocess.call(['git','-C',args.repo,'merge-base','--is-ancestor',args.required_main,args.sha],
                         stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)==0,'REQUIRED_MAIN_NOT_INCLUDED')
    need(digest(args.identity)==args.identity_sha256.lower(),'IDENTITY_HASH_MISMATCH')
    identity=json.loads(Path(args.identity).read_text(encoding='utf-8'))
    need(identity.get('sourceSHA')==args.sha, 'BUILD_SOURCE_MISMATCH')
    need(identity.get('platform')=='linux' and identity.get('arch')=='x64', 'BUILD_PLATFORM_MISMATCH')
    need(identity.get('smoke')=='PASS' and identity.get('secretsProvided') is False and
         identity.get('productionDatabaseAccess') is False and identity.get('databaseOperations') is False and
         identity.get('productionPublicConfig') is True and identity.get('publicConfigInlineAudit')=='PASS',
         'BUILD_SECURITY_ATTESTATION_MISSING')
    if extract:
        need(sys.platform=='linux' and platform.machine() in ('x86_64','amd64'),'LINUX_X64_REQUIRED')
        need(subprocess.check_output(['node','--version']).decode().strip()==identity.get('node'),'NODE_VERSION_MISMATCH')
        libc=platform.libc_ver()
        need(libc[0]=='glibc' and tuple(map(int,libc[1].split('.')))>=tuple(map(int,identity['glibc'].split('.'))),'GLIBC_MISMATCH')
        need(Path(args.target).is_dir() and not Path(args.target).is_symlink(),'TARGET_REQUIRED')
        need(git(args.target,'rev-parse','HEAD').decode().strip()==args.sha,'TARGET_SHA_MISMATCH')
        need(not git(args.target,'status','--porcelain','--untracked-files=no').strip(),'TARGET_TRACKED_DIRTY')
        need(not any((Path(args.target)/x).exists() for x in ('.next','node_modules')),'RUNTIME_TARGET_EXISTS')
    expected=tree(args.repo,args.sha); seen=set(); source=set(); members=[]; total=0
    need(not Path(args.archive).is_symlink() and os.path.getsize(args.archive)<=512*1024**2,'ARCHIVE_LIMIT')
    with open(args.archive,'rb') as stream:
        before=os.fstat(stream.fileno()); h=hashlib.sha256()
        for b in iter(lambda:stream.read(1048576),b''): h.update(b)
        need(h.hexdigest()==args.archive_sha256.lower(),'ARCHIVE_HASH_MISMATCH'); stream.seek(0)
        with tarfile.open(fileobj=stream,mode='r:gz') as archive:
            for m in archive:
                if m.name in ('.','./'): need(m.isdir(),'UNSAFE_ROOT'); continue
                p=name(m.name.rstrip('/'))
                need(p not in seen,'DUPLICATE_MEMBER'); seen.add(p)
                need(len(seen)<=250000,'MEMBER_LIMIT')
                need(not (m.mode & 0o7000),'SPECIAL_MODE')
                need(m.isdir() or m.isfile() or m.issym(),'SPECIAL_OR_HARDLINK_MEMBER')
                need(not any(x in ('.git','.npmrc') or x.startswith('.env') for x in p.split('/')),'FORBIDDEN_MEMBER')
                runtime=p in ('.next','node_modules') or p.startswith(('.next/','node_modules/'))
                if m.issym():
                    need(p.startswith('node_modules/'),'LINK_OUTSIDE_DEPENDENCIES')
                    target=posixpath.normpath(posixpath.join(posixpath.dirname(p),m.linkname))
                    need(not m.linkname.startswith('/') and '\\' not in m.linkname and target.startswith('node_modules/'),'ESCAPING_LINK')
                if m.isfile():
                    need(0<=m.size<=256*1024**2,'FILE_SIZE_LIMIT'); total+=m.size
                    need(total<=3*1024**3,'EXPANSION_LIMIT')
                    data=archive.extractfile(m).read()
                    secrets(data)
                    if not runtime:
                        need(p in expected,'UNEXPECTED_SOURCE_MEMBER')
                        need(expected[p][0] in ('100644','100755') and blob(data)==expected[p][1],'SOURCE_BLOB_MISMATCH')
                        need(bool(m.mode & 0o111)==(expected[p][0]=='100755'),'SOURCE_MODE_MISMATCH')
                        source.add(p)
                elif not runtime and not m.isdir(): raise Blocked('SOURCE_LINK_NOT_SUPPORTED')
                members.append((m,p,runtime))
            need(source==set(expected),'SOURCE_MEMBERS_MISSING')
            need({'.next/BUILD_ID','.next/routes-manifest.json','.next/required-server-files.json',
                  'node_modules/next/dist/bin/next'}<=seen,'RUNTIME_MEMBERS_MISSING')
            links={p for m,p,_ in members if m.issym()}
            need(not any('/'.join(p.split('/')[:i]) in links for p in seen
                         for i in range(1,len(p.split('/')))),'LINK_PARENT')
            targets={p:m.linkname for m,p,_ in members if m.issym()}
            for link,target in targets.items():
                # Resolve intermediate symlinks BEFORE '..', as the kernel does.
                # Lexical normalization alone can miss a composed escape.
                todo=(posixpath.dirname(link)+'/'+target).split('/')
                resolved=[]; followed=0
                while todo:
                    part=todo.pop(0)
                    if part in ('','.'):continue
                    if part=='..':
                        need(len(resolved)>1 and resolved[0]=='node_modules','ESCAPING_LINK');resolved.pop();continue
                    resolved.append(part); current='/'.join(resolved)
                    if current in targets:
                        followed+=1;need(followed<=40,'CYCLIC_LINK')
                        resolved.pop();todo=targets[current].split('/')+todo
                need('/'.join(resolved).startswith('node_modules/'),'ESCAPING_LINK')
            need(os.fstat(stream.fileno()).st_mtime_ns==before.st_mtime_ns,'ARCHIVE_CHANGED')
            if extract:
                root=Path(args.target)
                for m,p,runtime in members:
                    if not runtime: continue
                    out=root/p
                    if m.isdir(): out.mkdir(parents=True,exist_ok=True); os.chmod(out,0o755)
                    elif m.isfile():
                        out.parent.mkdir(parents=True,exist_ok=True)
                        with out.open('xb') as f:
                            data=archive.extractfile(m)
                            for b in iter(lambda:data.read(1048576),b''): f.write(b)
                        os.chmod(out,0o755 if m.mode&0o111 else 0o644)
                for m,p,runtime in members:
                    if m.issym():
                        out=root/p; out.parent.mkdir(parents=True,exist_ok=True); out.symlink_to(m.linkname)
    return {'sourceSHA':args.sha,'members':len(seen),'sourceFiles':len(source),
            'expandedBytes':total,'archiveSHA256':args.archive_sha256.lower(),'extracted':extract}

def runtime_tree(target):
    root=Path(target); result={}
    for base in ('.next','node_modules'):
        need((root/base).is_dir() and not (root/base).is_symlink(),'RUNTIME_ROOT_INVALID')
        for current,dirs,files in os.walk(root/base,followlinks=False):
            for leaf in sorted(dirs+files):
                p=Path(current)/leaf; rel=p.relative_to(root).as_posix()
                if p.is_symlink(): result[rel]={'link':os.readlink(p)}
                elif p.is_file(): result[rel]={'sha256':digest(p),'mode':stat.S_IMODE(p.stat().st_mode)}
    return result
def seal(args,check=False):
    need(sys.platform=='linux','LINUX_REQUIRED')
    marker=Path(args.seal)
    if check:
        need(marker.is_file() and not marker.is_symlink() and stat.S_IMODE(marker.stat().st_mode)==0o600,'IMPORT_SEAL_INVALID')
        saved=json.loads(marker.read_text())
        need(saved['sourceSHA']==args.sha and saved['files']==runtime_tree(args.target),'IMPORTED_RUNTIME_DRIFT')
    else:
        need(not marker.exists(),'IMPORT_SEAL_EXISTS')
        with marker.open('x') as f:
            os.chmod(marker,0o600)
            json.dump({'sourceSHA':args.sha,'files':runtime_tree(args.target)},f,sort_keys=True)
    return {'seal':'PASS','sourceSHA':args.sha}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('command',choices=['verify','extract','seal','check-seal'])
    for arg in ('repo','sha','required-main','archive','archive-sha256','identity','identity-sha256','target','seal'):
        p.add_argument('--'+arg,required=arg=='sha')
    a=p.parse_args()
    try:
        if a.command in ('verify','extract'):
            need(all(getattr(a,x) for x in ('repo','required_main','archive','archive_sha256','identity','identity_sha256')),'ARGUMENTS_REQUIRED')
            result=verify(a,a.command=='extract')
        else: result=seal(a,a.command=='check-seal')
        print(json.dumps(result))
    except (Blocked,OSError,ValueError,KeyError,tarfile.TarError,subprocess.SubprocessError) as e:
        print('BLOCKED:'+str(e) if isinstance(e,Blocked) else 'BLOCKED:VERIFICATION_FAILED',file=sys.stderr)
        return 1
    return 0
if __name__=='__main__': sys.exit(main())
