#!/usr/bin/env bash
set -euo pipefail
# Explicit isolated-target admission; never use linked Supabase or remote DB.
[[ "${CI:-}" == true && "${PROFILE_SECURITY_ISOLATED:-}" == true ]]
[[ "${PGHOST:-}" == 127.0.0.1 && "${PGDATABASE:-}" == profiles_security_isolated ]]
[[ "${PGPORT:-}" =~ ^[0-9]+$ ]]
cd "$(dirname "$0")/../.."
psql -X -v ON_ERROR_STOP=1 -q -f scripts/ci/profiles-security-baseline.sql
psql -X -v ON_ERROR_STOP=1 -q -f scripts/ci/profiles-security-before.sql
before=$(psql -X -Atqc "select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'')) from profiles p")
psql -X -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261009170042_profiles_insert_privilege_hardening.sql
psql -X -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261009170042_profiles_insert_privilege_hardening.sql
after=$(psql -X -Atqc "select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'')) from profiles p")
[[ "$before" == "$after" ]]
psql -X -v ON_ERROR_STOP=1 -q -f scripts/ci/profiles-security-after.sql
echo 'REAL_PROFILE_SECURITY_DB_PASS=yes; MIGRATION_ZERO_ROW_MUTATION=yes; IDEMPOTENT_PASS=yes'
