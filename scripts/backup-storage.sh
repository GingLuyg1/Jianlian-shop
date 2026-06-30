#!/usr/bin/env bash
set -euo pipefail

# Supabase Storage backup template.
# This script downloads bucket objects using the Storage REST API.
# Required env:
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
#   STORAGE_BACKUP_BUCKETS      Comma-separated bucket names
#   BACKUP_OUTPUT_DIR
#   BACKUP_ENCRYPTION_PASS

for name in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY STORAGE_BACKUP_BUCKETS BACKUP_OUTPUT_DIR BACKUP_ENCRYPTION_PASS; do
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required" >&2
    exit 1
  fi
done

if [[ ! -d "$BACKUP_OUTPUT_DIR" ]]; then
  echo "Backup output directory does not exist: $BACKUP_OUTPUT_DIR" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="${BACKUP_OUTPUT_DIR}/storage-${STAMP}"
ARCHIVE="${BACKUP_OUTPUT_DIR}/jianlian-${APP_ENV:-production}-${STAMP}-storage.tar.gz"
ENC_FILE="${ARCHIVE}.enc"
SHA_FILE="${ENC_FILE}.sha256"

mkdir -p "$WORK_DIR"
IFS=',' read -ra BUCKETS <<< "$STORAGE_BACKUP_BUCKETS"

echo "Starting storage manifest backup at ${STAMP}"
for bucket in "${BUCKETS[@]}"; do
  bucket_trimmed="$(echo "$bucket" | xargs)"
  [[ -z "$bucket_trimmed" ]] && continue
  mkdir -p "${WORK_DIR}/${bucket_trimmed}"
  curl --fail --silent --show-error \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    "${SUPABASE_URL}/storage/v1/object/list/${bucket_trimmed}" \
    --data '{"limit":1000,"offset":0,"sortBy":{"column":"name","order":"asc"}}' \
    > "${WORK_DIR}/${bucket_trimmed}/manifest.json"
done

tar -czf "$ARCHIVE" -C "$WORK_DIR" .
openssl enc -aes-256-cbc -salt -pbkdf2 -in "$ARCHIVE" -out "$ENC_FILE" -pass env:BACKUP_ENCRYPTION_PASS
rm -rf "$WORK_DIR" "$ARCHIVE"
sha256sum "$ENC_FILE" > "$SHA_FILE"

echo "Storage manifest backup completed"
echo "Encrypted file: $ENC_FILE"
echo "Checksum file: $SHA_FILE"
