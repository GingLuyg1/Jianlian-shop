# Fresh database bootstrap forensic follow-up

FRESH_DATABASE_BOOTSTRAP_BROKEN=yes

BROKEN_FILE=`supabase/migrations/20260622_digital_delivery_hardening.sql`

BROKEN_AREA=`public.mask_delivery_secret` around line 184. The branch for a null or empty secret contains an unterminated SQL string. In the isolated GitHub Actions PostgreSQL bootstrap, `psql -v ON_ERROR_STOP=1` stopped at line 188 with `unterminated quoted string`.

This is an existing digital-delivery migration issue, separate from the WeChat watcher and payment completion RPCs. It prevents a fresh installation or full CI migration replay. It does not by itself establish a defect in the already-running Production database; Production was not used for this test and no Production schema was changed.

Do not guess the intended original string or silently skip this migration in a full bootstrap. A separate forensic repair should establish the intended source text from authoritative history, evaluate migration-history consequences, and then choose a reviewed, safe correction. The watcher concurrency acceptance uses a separate temporary PostgreSQL database with a payment-only schema and dynamically loads the current canonical payment RPC definitions from repository migrations.
