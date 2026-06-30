#!/usr/bin/env bash
set -euo pipefail

# Example restore script. It refuses to run unless CONFIRM_RESTORE=I_UNDERSTAND is provided.
# Restore to a temporary database first. Do not point DATABASE_URL at production unless explicitly approved.

if [[ "${CONFIRM_RESTORE:-}" != "I_UNDERSTAND" ]]; then
  echo "Refusing to restore. Set CONFIRM_RESTORE=I_UNDERSTAND after verifying target database." >&2
  exit 1
fi

for name in DATABASE_URL BACKUP_ENCRYPTION_PASS ENCRYPTED_BACKUP_FILE; do
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required" >&2
    exit 1
  fi
done

if [[ ! -f "$ENCRYPTED_BACKUP_FILE" ]]; then
  echo "Encrypted backup file not found: $ENCRYPTED_BACKUP_FILE" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -in "$ENCRYPTED_BACKUP_FILE" -out "$WORK_DIR/restore.dump.gz" -pass env:BACKUP_ENCRYPTION_PASS
gunzip "$WORK_DIR/restore.dump.gz"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$DATABASE_URL" "$WORK_DIR/restore.dump"

echo "Restore completed. Run scripts/restore-consistency-check.sql against the restored database before reopening writes."
