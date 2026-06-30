#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: scripts/verify-backup.sh <encrypted-backup-file> <sha256-file>" >&2
  exit 1
fi

BACKUP_FILE="$1"
SHA_FILE="$2"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [[ ! -f "$SHA_FILE" ]]; then
  echo "Checksum file not found: $SHA_FILE" >&2
  exit 1
fi

sha256sum --check "$SHA_FILE"
echo "Backup checksum verified: $BACKUP_FILE"
