#!/usr/bin/env bash
set -euo pipefail

# Jianlian Shop database backup template.
# Required env:
#   DATABASE_URL             PostgreSQL connection string
#   BACKUP_OUTPUT_DIR        Directory for encrypted backups
#   BACKUP_ENCRYPTION_PASS   Passphrase for encryption
# Optional env:
#   APP_ENV                  production/staging/local
#   APP_VERSION              release version

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [[ -z "${BACKUP_OUTPUT_DIR:-}" ]]; then
  echo "BACKUP_OUTPUT_DIR is required" >&2
  exit 1
fi

if [[ -z "${BACKUP_ENCRYPTION_PASS:-}" ]]; then
  echo "BACKUP_ENCRYPTION_PASS is required" >&2
  exit 1
fi

if [[ ! -d "$BACKUP_OUTPUT_DIR" ]]; then
  echo "Backup output directory does not exist: $BACKUP_OUTPUT_DIR" >&2
  exit 1
fi

ENV_NAME="${APP_ENV:-production}"
VERSION="${APP_VERSION:-unknown}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASENAME="jianlian-${ENV_NAME}-${VERSION}-${STAMP}-database-full"
RAW_FILE="${BACKUP_OUTPUT_DIR}/${BASENAME}.dump"
ENC_FILE="${RAW_FILE}.gz.enc"
SHA_FILE="${ENC_FILE}.sha256"

echo "Starting database backup at ${STAMP}"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$RAW_FILE"
gzip -9 "$RAW_FILE"
openssl enc -aes-256-cbc -salt -pbkdf2 -in "${RAW_FILE}.gz" -out "$ENC_FILE" -pass env:BACKUP_ENCRYPTION_PASS
rm -f "${RAW_FILE}.gz"
sha256sum "$ENC_FILE" > "$SHA_FILE"

echo "Backup completed at $(date -u +%Y%m%dT%H%M%SZ)"
echo "Encrypted file: $ENC_FILE"
echo "Checksum file: $SHA_FILE"
echo "Size bytes: $(wc -c < "$ENC_FILE")"
