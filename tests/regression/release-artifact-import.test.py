"""Synthetic archive safety cases; no business/database calls or production files."""
import base64, hashlib, importlib.util, io, json, os, subprocess, tarfile, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
SPEC=importlib.util.spec_from_file_location('importer',Path(__file__).parents[2]/'scripts/release-artifact.py')
M=importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)

class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='jl-import-test-')
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name); self.repo=self.root/'repo'; self.repo.mkdir()
        def g(*args): return subprocess.check_output(['git','-C',str(self.repo),*args],stderr=subprocess.DEVNULL).decode().strip()
        self.g=g; g('init','-q'); g('config','user.email','synthetic@example.invalid'); g('config','user.name','Synthetic')
        (self.repo/'app.js').write_bytes(b'// synthetic application source\n')
        g('add','.');g('commit','-qm','synthetic baseline'); self.sha=g('rev-parse','HEAD')
        self.identity=self.root/'identity.json'
        self.identity.write_text(json.dumps(dict(sourceSHA=self.sha,platform='linux',arch='x64',
            node='v20.20.2',glibc='2.34',smoke='PASS',secretsProvided=False,productionDatabaseAccess=False,
            databaseOperations=False,productionPublicConfig=True,publicConfigInlineAudit='PASS',
            publicConfigDigests={k:hashlib.sha256(v.encode()).hexdigest() for k,v in
                {'NEXT_PUBLIC_SUPABASE_URL':'https://fixture.invalid','NEXT_PUBLIC_SUPABASE_ANON_KEY':'fixture-public-value'}.items()})))
        self.archive=self.root/'archive.tar.gz'
        self.files={'app.js':b'// synthetic application source\n','.next/BUILD_ID':b'synthetic-id',
                    '.next/routes-manifest.json':b'{}','.next/required-server-files.json':b'{}',
                    'node_modules/next/dist/bin/next':b'// synthetic entry\n'}
    def pack(self,extra=None):
        with tarfile.open(self.archive,'w:gz') as t:
            for p,data in self.files.items():
                member=tarfile.TarInfo('./'+p);member.size=len(data);member.mode=0o644;t.addfile(member,io.BytesIO(data))
            if extra: extra(t)
        return SimpleNamespace(repo=str(self.repo),sha=self.sha,required_main=self.sha,
            archive=str(self.archive),archive_sha256=M.digest(self.archive),
            identity=str(self.identity),identity_sha256=M.digest(self.identity),target=None)
    def reject(self,code,extra=None,mutate=None):
        a=self.pack(extra)
        if mutate: mutate(a)
        with self.assertRaisesRegex(M.Blocked,code): M.verify(a)
    def member(self,p,data=b'x',kind=None,link=''):
        def add(t):
            m=tarfile.TarInfo(p);m.mode=0o644
            if kind: m.type=kind;m.linkname=link
            else:m.size=len(data)
            t.addfile(m,None if kind else io.BytesIO(data))
        return add
    def test_valid_exact_source(self): self.assertEqual(M.verify(self.pack())['sourceFiles'],1)
    def test_wrong_archive_hash(self): self.reject('ARCHIVE_HASH_MISMATCH',mutate=lambda a:setattr(a,'archive_sha256','0'*64))
    def test_wrong_identity_hash(self): self.reject('IDENTITY_HASH_MISMATCH',mutate=lambda a:setattr(a,'identity_sha256','0'*64))
    def test_old_source_cannot_claim_new_main(self):
        (self.repo/'new-ui.js').write_bytes(b'// new UI\n');self.g('add','.');self.g('commit','-qm','new main')
        newer=self.g('rev-parse','HEAD')
        self.reject('REQUIRED_MAIN_NOT_INCLUDED',mutate=lambda a:setattr(a,'required_main',newer))
    def test_source_blob_drift(self): self.files['app.js']=b'changed';self.reject('SOURCE_BLOB_MISMATCH')
    def test_source_missing(self): del self.files['app.js'];self.reject('SOURCE_MEMBERS_MISSING')
    def test_unknown_source(self): self.files['unknown.js']=b'x';self.reject('UNEXPECTED_SOURCE_MEMBER')
    def test_full_sha_required(self): self.reject('FULL_SHA_REQUIRED',mutate=lambda a:setattr(a,'sha',a.sha[:8]))
    def test_archive_traversal(self): self.reject('UNSAFE_PATH',self.member('../escape'))
    def test_archive_absolute_path(self): self.reject('UNSAFE_PATH',self.member('/escape'))
    def test_windows_path(self): self.reject('UNSAFE_PATH',self.member('C:/escape'))
    def test_backslash(self): self.reject('UNSAFE_PATH',self.member('node_modules/..\\escape'))
    def test_duplicate_member(self): self.reject('DUPLICATE_MEMBER',self.member('./app.js'))
    def test_hardlink(self): self.reject('SPECIAL_OR_HARDLINK_MEMBER',self.member('node_modules/a',kind=tarfile.LNKTYPE,link='app.js'))
    def test_fifo(self): self.reject('SPECIAL_OR_HARDLINK_MEMBER',self.member('node_modules/a',kind=tarfile.FIFOTYPE))
    def test_escaping_symlink(self): self.reject('ESCAPING_LINK',self.member('node_modules/link',kind=tarfile.SYMTYPE,link='../../escape'))
    def test_parent_symlink(self):
        def add(t):
            self.member('node_modules/link',kind=tarfile.SYMTYPE,link='next')(t)
            self.member('node_modules/link/child')(t)
        self.reject('LINK_PARENT',add)
    def test_safe_dependency_symlink(self):
        a=self.pack(self.member('node_modules/.bin/next',kind=tarfile.SYMTYPE,link='../next/dist/bin/next'))
        self.assertGreater(M.verify(a)['members'],5)
    def test_composed_symlink_escape(self):
        def add(t):
            self.member('node_modules/foo/dir/link',kind=tarfile.SYMTYPE,link='../../q')(t)
            self.member('node_modules/a',kind=tarfile.SYMTYPE,link='foo/dir/link/../../outside')(t)
        self.reject('ESCAPING_LINK',add)
    def test_transient_escape_cannot_return_inside(self):
        self.reject('ESCAPING_LINK',self.member('node_modules/link',kind=tarfile.SYMTYPE,link='../outside/../node_modules/next'))
    def test_environment_file(self): self.reject('FORBIDDEN_MEMBER',self.member('.env.production.local'))
    def test_npm_credentials(self): self.reject('FORBIDDEN_MEMBER',self.member('node_modules/.npmrc'))
    def test_privileged_jwt(self):
        enc=lambda x:base64.urlsafe_b64encode(json.dumps(x).encode()).rstrip(b'=')
        token=enc({'alg':'HS256'})+b'.'+enc({'role':'service_role'})+b'.synthetic-signature'
        self.reject('PRIVILEGED_JWT_IN_ARTIFACT',self.member('node_modules/token.js',token))
    def test_secret_key(self): self.reject('SERVER_SECRET_IN_ARTIFACT',self.member('node_modules/token.js',b'sb_secret_'+b'a'*32))
    def test_source_identity_mismatch(self):
        a=self.pack();v=json.loads(self.identity.read_text());v['sourceSHA']='f'*40
        self.identity.write_text(json.dumps(v));a.identity_sha256=M.digest(self.identity)
        with self.assertRaisesRegex(M.Blocked,'BUILD_SOURCE_MISMATCH'): M.verify(a)
    def test_missing_security_attestation(self):
        a=self.pack();v=json.loads(self.identity.read_text());v['secretsProvided']=True
        self.identity.write_text(json.dumps(v));a.identity_sha256=M.digest(self.identity)
        with self.assertRaisesRegex(M.Blocked,'BUILD_SECURITY_ATTESTATION_MISSING'): M.verify(a)
    def test_runtime_incomplete(self):
        del self.files['.next/BUILD_ID'];self.reject('RUNTIME_MEMBERS_MISSING')
    def test_source_exec_mode_drift(self):
        self.g('update-index','--chmod=+x','app.js');self.g('commit','-qm','executable source');self.sha=self.g('rev-parse','HEAD')
        v=json.loads(self.identity.read_text());v['sourceSHA']=self.sha;self.identity.write_text(json.dumps(v))
        self.reject('SOURCE_MODE_MISMATCH')

    @unittest.skipUnless(os.name=='posix','POSIX runtime permissions')
    def test_runtime_seal_detects_content_change(self):
        self.files['.next/BUILD_ID']=b'synthetic-id'
        root=self.root/'runtime';(root/'.next').mkdir(parents=True);(root/'node_modules').mkdir()
        (root/'.next/BUILD_ID').write_bytes(b'synthetic-id')
        a=SimpleNamespace(sha=self.sha,target=str(root),seal=str(self.root/'seal.json'))
        M.seal(a)
        M.seal(a,True)
        (root/'.next/BUILD_ID').write_bytes(b'tampered')
        with self.assertRaisesRegex(M.Blocked,'IMPORTED_RUNTIME_DRIFT'):M.seal(a,True)
    @unittest.skipUnless(os.name=='posix','POSIX runtime permissions')
    def test_runtime_seal_detects_added_file(self):
        root=self.root/'runtime';(root/'.next').mkdir(parents=True);(root/'node_modules').mkdir()
        a=SimpleNamespace(sha=self.sha,target=str(root),seal=str(self.root/'seal.json'))
        M.seal(a);(root/'node_modules/injected.js').write_bytes(b'x')
        with self.assertRaisesRegex(M.Blocked,'IMPORTED_RUNTIME_DRIFT'):M.seal(a,True)
    @unittest.skipUnless(os.name=='posix','POSIX runtime permissions')
    def test_runtime_seal_rejects_permissions(self):
        root=self.root/'runtime';(root/'.next').mkdir(parents=True);(root/'node_modules').mkdir()
        a=SimpleNamespace(sha=self.sha,target=str(root),seal=str(self.root/'seal.json'))
        M.seal(a);os.chmod(a.seal,0o644)
        with self.assertRaisesRegex(M.Blocked,'IMPORT_SEAL_INVALID'):M.seal(a,True)

    def target_args(self):
        target=self.root/'target'
        self.g('worktree','add','--detach',str(target),self.sha)
        env_file=target/'.env.production.local'
        env_file.write_text('NEXT_PUBLIC_SUPABASE_URL=https://fixture.invalid\nNEXT_PUBLIC_SUPABASE_ANON_KEY=fixture-public-value\n')
        os.chmod(env_file,0o600)
        a=self.pack(self.member('node_modules/.bin/next',kind=tarfile.SYMTYPE,link='../next/dist/bin/next'))
        a.target=str(target)
        return a,target
    @unittest.skipUnless(os.name=='posix','Linux extraction')
    def test_extract_runtime_without_replacing_source(self):
        a,target=self.target_args();before=(target/'app.js').read_bytes()
        self.assertTrue(M.verify(a,True)['extracted'])
        self.assertEqual((target/'app.js').read_bytes(),before)
        self.assertEqual((target/'.next/BUILD_ID').read_bytes(),b'synthetic-id')
        self.assertEqual((target/'node_modules/.bin/next').read_bytes(),b'// synthetic entry\n')
    @unittest.skipUnless(os.name=='posix','Linux extraction')
    def test_extract_refuses_existing_runtime(self):
        a,target=self.target_args();(target/'.next').mkdir()
        with self.assertRaisesRegex(M.Blocked,'RUNTIME_TARGET_EXISTS'):M.verify(a,True)
    @unittest.skipUnless(os.name=='posix','Linux extraction')
    def test_extract_checks_node_version(self):
        a,target=self.target_args();v=json.loads(self.identity.read_text());v['node']='v0.0.0'
        self.identity.write_text(json.dumps(v));a.identity_sha256=M.digest(self.identity)
        with self.assertRaisesRegex(M.Blocked,'NODE_VERSION_MISMATCH'):M.verify(a,True)
        self.assertFalse((target/'.next').exists())
    @unittest.skipUnless(os.name=='posix','Linux extraction')
    def test_extract_public_config_mismatch(self):
        a,target=self.target_args();(target/'.env.production.local').write_text('NEXT_PUBLIC_SUPABASE_URL=https://other.invalid\nNEXT_PUBLIC_SUPABASE_ANON_KEY=fixture-public-value\n')
        with self.assertRaisesRegex(M.Blocked,'BUILD_RUNTIME_PUBLIC_CONFIG_MISMATCH'):M.verify(a,True)
    @unittest.skipUnless(os.name=='posix','Linux extraction')
    def test_extract_public_env_duplicate(self):
        a,target=self.target_args()
        with (target/'.env.production.local').open('a') as f:f.write('NEXT_PUBLIC_SUPABASE_URL=https://fixture.invalid\n')
        with self.assertRaisesRegex(M.Blocked,'PUBLIC_ENV_MISSING_OR_DUPLICATE'):M.verify(a,True)
    @unittest.skipUnless(os.name=='posix','Linux extraction')
    def test_extract_rejects_dirty_source(self):
        a,target=self.target_args();(target/'app.js').write_bytes(b'changed')
        with self.assertRaisesRegex(M.Blocked,'TARGET_TRACKED_DIRTY'):M.verify(a,True)

if __name__=='__main__': unittest.main(verbosity=2)
