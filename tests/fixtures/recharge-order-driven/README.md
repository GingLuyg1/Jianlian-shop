# Synthetic order-driven database fixture

These JSON files contain schema-only Test metadata captured for the existing order-driven scanner acceptance on 2026-10-27. They contain column definitions, constraints, indexes, triggers and the three pinned pre-scanner financial function definitions. There are no customer rows, passwords, provider credentials, real transactions or production backup data.

`tests/integration/recharge-order-driven-pg17.mjs` creates its own loopback-only disposable PG17 cluster, restores these metadata definitions, supplies ID-only external table stubs and generates all row/chain data synthetically. It applies the unchanged scanner baseline SQL followed by the new forward migration. It never reads `.env` or connects to Test/Production. The receipt explicitly records the stub boundary; it does not claim a complete Supabase restore.
