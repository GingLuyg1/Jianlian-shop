#!/usr/bin/env bash
# Candidate packager; run only after Linux/Node 20 npm ci, checks, and next build.
set -Eeuo pipefail
umask 077

die() { printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == Linux ]] || die 'Linux build host required'
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 20 ]] || die 'Node.js 20 required'
[[ -f package-lock.json && -f .next/standalone/server.js && -d .next/static && -d public ]] || die 'incomplete build inputs'
git diff --quiet && git diff --cached --quiet || die 'tracked source changes are not committed'
[[ -z "$(git ls-files --others --exclude-standard | grep -v '^ops/standalone-v25/' || true)" ]] || die 'untracked files require review'
for source in .next/standalone .next/static public; do
  if find "$source" -type f \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' \) -print -quit | grep -q .; then
    die 'private configuration or key-like file found in build inputs'
  fi
done

sha="$(git rev-parse HEAD)"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die 'invalid commit SHA'
out="${1:?provide an empty output directory outside the repository}"
[[ "$out" == /* ]] || die 'output directory must be absolute'
case "$(readlink -m "$out")/" in "$(pwd -P)/"*) die 'output directory must be outside the repository' ;; esac
[[ ! -e "$out" ]] || die 'output directory already exists'
mkdir -m 700 -p -- "$out"
bundle="$out/jianlian-shop-$sha"
mkdir -m 700 -- "$bundle"
cp -a .next/standalone/. "$bundle/"
mkdir -p "$bundle/.next"
cp -a .next/static "$bundle/.next/static"
cp -a public "$bundle/public"

[[ -f "$bundle/server.js" && -d "$bundle/.next/static" && -d "$bundle/public" ]] || die 'bundle structure incomplete'
if find "$bundle" -type f \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' \) -print -quit | grep -q .; then
  die 'private configuration or key-like file found in bundle'
fi
if find "$bundle" -type d -name 'sharp-win32-*' -print -quit | grep -q .; then
  die 'Windows native dependency found in Linux bundle'
fi

archive="$out/jianlian-shop-$sha.tar.gz"
tar -C "$out" -czf "$archive" "jianlian-shop-$sha"
sha256sum "$archive" > "$archive.sha256"
du -sb "$bundle" "$archive"
printf 'ARCHIVE_SHA256='; sha256sum "$archive" | cut -d ' ' -f 1
printf 'PACKAGE_STATUS=REHEARSAL_ONLY_UNTIL_SECURITY_PATCH_AND_LINUX_HTTP_GATE\n'
