#!/usr/bin/env bash
# Read-only runtime checks plus disposable local upload/unpack/switch simulation.
set -Eeuo pipefail
umask 077

die() { printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }
[[ "$(uname -s)" == Linux ]] || die 'Linux runner required'
[[ "$(uname -m)" == x86_64 ]] || die 'x86_64 runner required'
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 20 ]] || die 'Node.js 20 required'

out="${1:?provide package output directory}"
sha="$(git rev-parse HEAD)"
bundle="$out/jianlian-shop-$sha"
archive="$out/jianlian-shop-$sha.tar.gz"
[[ -f "$bundle/server.js" && -f "$archive" && -f "$archive.sha256" ]] || die 'missing bundle or archive'
(cd "$out" && sha256sum -c "$(basename "$archive.sha256")") || die 'archive checksum mismatch'
[[ -d "$bundle/.next/static" && -d "$bundle/public" ]] || die 'missing static/public'

# No repository or Production secret is supplied to this public-runner workflow.
if grep -RIlE 'qvbovrvybirscaurwuov|sb_secret_[[:alnum:]_]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' "$bundle" --exclude='*.map' | grep -q .; then
  die 'production reference or secret-shaped material found in bundle'
fi
if find "$bundle" -type d -name 'sharp-win32-*' -print -quit | grep -q .; then
  die 'Windows native dependency in Linux package'
fi

work="$(mktemp -d)"
server_pid=''
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  rm -rf -- "$work"
}
trap cleanup EXIT

PORT=3097 HOSTNAME=127.0.0.1 NODE_ENV=production node "$bundle/server.js" >"$work/server.log" 2>&1 &
server_pid=$!
ready=0
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3097/api/health > /dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || die 'standalone health endpoint failed'
for path in /login /api/health /api/health/liveness; do
  curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:3097$path" > /dev/null || die "HTTP smoke failed: $path"
done
asset="$(find "$bundle/.next/static" -type f \( -name '*.css' -o -name '*.js' \) -print -quit)"
[[ -n "$asset" ]] || die 'no static CSS/JS asset'
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:3097/_next/static/${asset#"$bundle/.next/static/"}" > /dev/null || die 'static asset HTTP failed'

# Simulate upload, unpack, and a second release copy to measure the conservative
# incremental peak. The existing Production release is already in free-space baseline.
mkdir -p "$work/upload" "$work/unpack" "$work/final" "$work/old"
cp -a "$archive" "$work/upload/"
tar -C "$work/unpack" -xzf "$work/upload/$(basename "$archive")"
cp -a "$work/unpack/jianlian-shop-$sha" "$work/final/"
peak_bytes="$(du -sB1 "$work/upload" "$work/unpack" "$work/final" | awk '{sum += $1} END {print sum}')"
ln -s "$work/old" "$work/current"
ln -s "$work/final/jianlian-shop-$sha" "$work/current.next"
mv -Tf "$work/current.next" "$work/current"
[[ "$(readlink "$work/current")" == "$work/final/jianlian-shop-$sha" ]] || die 'local pointer switch failed'
ln -s "$work/old" "$work/current.next"
mv -Tf "$work/current.next" "$work/current"
[[ "$(readlink "$work/current")" == "$work/old" ]] || die 'local pointer rollback failed'

expanded_bytes="$(du -sB1 "$bundle" | awk '{print $1}')"
archive_bytes="$(stat -c '%s' "$archive")"
printf 'LINUX_PACKAGE_ARCHIVE_BYTES=%s\nLINUX_EXPANDED_DISK_BYTES=%s\nLOCAL_PEAK_EXTRA_DISK_BYTES=%s\n' "$archive_bytes" "$expanded_bytes" "$peak_bytes"
printf 'LINUX_STANDALONE_HTTP=PASS\nLOCAL_POINTER_SWITCH_ROLLBACK=PASS_NOT_PM2_NGINX\n'
{
  printf 'Linux archive: %s bytes  \n' "$archive_bytes"
  printf 'Linux expanded disk: %s bytes  \n' "$expanded_bytes"
  printf 'Local upload/unpack/second-copy peak: %s bytes  \n' "$peak_bytes"
  printf 'Standalone HTTP: PASS; pointer simulation: PASS (not PM2/Nginx).  \n'
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
