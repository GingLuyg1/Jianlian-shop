#!/usr/bin/env python3
"""Recover already built immutable app archives for an import-only CI check."""
import gzip, hashlib, io, json, os, pathlib, re, subprocess, sys, tarfile, zipfile

REPO = 'GingLuyg1/Jianlian-shop'
def need(ok, code):
    if not ok: raise RuntimeError(code)
def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1048576), b''): h.update(block)
    return h.hexdigest()
def derive_deployment(work, out, kind, pin, pins, control_sha):
    identity = json.loads((out / 'build-identity.json').read_text())
    # Preserve the original build, then derive a strict deployment package.
    # Next's ignored type declaration is not runtime or frozen source.
    archive_name = f'usdt-scanner-{kind}-{pin["sourceSHA"]}-linux-x64.tar.gz'
    parent = work / 'original-release-archive.tar.gz'
    (out / archive_name).rename(parent)
    removed = []
    with parent.open('rb') as inp, (out / archive_name).open('xb') as raw:
        with tarfile.open(fileobj=inp, mode='r:gz') as old, gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as gz:
            with tarfile.open(fileobj=gz, mode='w|') as new:
                for member in old:
                    source = old.extractfile(member) if member.isfile() else None
                    if member.name in ('next-env.d.ts', './next-env.d.ts'):
                        need(member.isfile() and member.size == 201, 'GENERATED_TYPE_MEMBER_DRIFT')
                        data = source.read()
                        need(hashlib.sha256(data).hexdigest() == pins['generatedTypeSHA256'], 'GENERATED_TYPE_HASH_MISMATCH')
                        removed.append(dict(path='next-env.d.ts', sha256=pins['generatedTypeSHA256'], bytes=201))
                    else: new.addfile(member, source)
    need(len(removed) == 1, 'GENERATED_TYPE_COUNT_MISMATCH')
    (work / 'original-build-identity.json').write_bytes((out / 'build-identity.json').read_bytes())
    identity['packaging'] = dict(parentArchiveSHA256=pin['files'][archive_name],
        controlSHA=control_sha, removedGeneratedMembers=removed,
        applicationRebuilt=False, runtimeBytesUnchanged=True)
    (out / 'build-identity.json').write_text(json.dumps(identity, indent=2)+'\n')
    for manifest, filename in [('SHA256SUMS', archive_name), ('IDENTITY_SHA256SUMS', 'build-identity.json')]:
        (out / manifest).write_text(digest(out / filename)+'  '+filename+'\n')

def main():
    need(os.environ.get('GITHUB_ACTIONS') == 'true', 'CI_ONLY')
    token = os.environ.pop('GH_TOKEN')
    need(token and not any(c in token for c in '\r\n"'), 'CI_TOKEN_INVALID')
    pins = json.loads(pathlib.Path('scripts/ci/release-reuse-artifacts.json').read_text())
    root = pathlib.Path(os.environ['RUNNER_TEMP'])
    for kind in ('candidate', 'rollback'):
        pin = pins[kind]
        work = root / ('usdt-scanner-' + kind)
        work.mkdir(mode=0o700); out = work / 'out'; out.mkdir(mode=0o700)
        url = f'https://api.github.com/repos/{REPO}/actions/artifacts/{pin["artifactId"]}/zip'
        target = work / 'download.zip'
        config = f'header = "Authorization: Bearer {token}"\nheader = "Accept: application/vnd.github+json"\n'
        result = subprocess.run(['curl', '--config', '-', '--fail', '--silent', '--show-error',
            '--location', '--proto', '=https', '--proto-redir', '=https', '--max-time', '300',
            '--max-filesize', '1073741824', '--output', str(target), url],
            input=config.encode(), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        need(result.returncode == 0, 'ARTIFACT_DOWNLOAD_FAILED')
        need(target.stat().st_size == pin['zipBytes'] and digest(target) == pin['zipSHA256'], 'ZIP_PIN_MISMATCH')
        with zipfile.ZipFile(target) as archive:
            items = archive.infolist()
            need(0 < len(items) <= 200 and sum(x.file_size for x in items) <= 1073741824, 'ZIP_LIMIT')
            seen = set()
            for item in items:
                need(re.fullmatch(r'[A-Za-z0-9_.-]+', item.filename) and item.filename not in seen,
                     'ZIP_MEMBER_REJECTED')
                need(not item.is_dir() and (item.external_attr >> 16) & 0o170000 != 0o120000, 'ZIP_LINK_REJECTED')
                seen.add(item.filename)
                with archive.open(item) as src, (out / item.filename).open('xb') as dst:
                    for block in iter(lambda: src.read(1048576), b''): dst.write(block)
                os.chmod(out / item.filename, 0o600)
        identity = json.loads((out / 'build-identity.json').read_text())
        need(identity['sourceSHA'] == pin['sourceSHA'] and identity['controlSHA'] == pins['controlSHA'] and
             str(identity['runId']) == str(pins['runId']) and identity['smoke'] == 'PASS', 'BUILD_IDENTITY_MISMATCH')
        for filename, expected in pin['files'].items():
            need(digest(out / filename) == expected, 'INNER_FILE_PIN_MISMATCH')
        # Fetch the existing public pins only; no app compilation or test replay.
        config_work = work / 'public-fetch'; config_work.mkdir(); (config_work / 'out').mkdir()
        subprocess.run(['node', 'scripts/ci/usdt-scanner-public-config.mjs', '--fetch', str(config_work)], check=True)
        (work / 'public-config.json').write_bytes((config_work / 'public-config.json').read_bytes())
        os.chmod(work / 'public-config.json', 0o600)
        (out / 'reuse-proof.json').write_text(json.dumps(dict(kind=kind, runId=pins['runId'],
            sourceSHA=pin['sourceSHA'], zipSHA256=pin['zipSHA256'], appRebuilt=False, pinVerified=True), indent=2))
        control_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip()
        derive_deployment(work, out, kind, pin, pins, control_sha)
    print('EXACT_EXISTING_APP_ARTIFACTS_RECOVERED')
if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(str(error) if re.fullmatch('[A-Z_]+', str(error)) else 'ARTIFACT_REUSE_FAILED', file=sys.stderr)
        sys.exit(1)
