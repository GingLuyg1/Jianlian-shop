-- Make the reconciliation dedupe contract compatible with PostgREST
-- `upsert(..., { onConflict: "dedupe_key" })`.
--
-- A normal PostgreSQL UNIQUE index already permits multiple NULL values. The
-- previous partial unique index therefore was unnecessary and could not be
-- inferred by ON CONFLICT (dedupe_key) without an equivalent predicate.
-- This migration changes only the index definition and never rewrites rows.

do $migration$
declare
  v_dedupe_attnum smallint;
  v_dedupe_type regtype;
  v_duplicate_keys bigint;
  v_index_oid oid;
  v_index_unique boolean;
  v_index_key_count integer;
  v_index_attribute_count integer;
  v_index_first_attnum smallint;
  v_index_has_expressions boolean;
  v_index_method text;
  v_index_predicate text;
  v_backing_constraint text;
begin
  if to_regclass('public.payment_reconciliations') is null then
    raise exception 'payment_reconciliations table is missing';
  end if;

  select a.attnum, a.atttypid::regtype
    into v_dedupe_attnum, v_dedupe_type
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.payment_reconciliations'::regclass
    and a.attname = 'dedupe_key'
    and a.attnum > 0
    and not a.attisdropped;

  if v_dedupe_attnum is null then
    raise exception 'payment_reconciliations.dedupe_key column is missing';
  end if;
  if v_dedupe_type <> 'text'::regtype then
    raise exception 'payment_reconciliations.dedupe_key must be text, found %', v_dedupe_type;
  end if;

  select count(*)
    into v_duplicate_keys
  from (
    select pr.dedupe_key
    from public.payment_reconciliations pr
    where pr.dedupe_key is not null
    group by pr.dedupe_key
    having count(*) > 1
  ) duplicate_keys;

  if v_duplicate_keys > 0 then
    raise exception 'refusing dedupe index migration: % duplicate non-null dedupe_key value(s)', v_duplicate_keys;
  end if;

  select
    i.indexrelid,
    i.indisunique,
    i.indnkeyatts,
    i.indnatts,
    i.indkey[0],
    i.indexprs is not null,
    am.amname,
    pg_catalog.pg_get_expr(i.indpred, i.indrelid),
    (
      select c.conname
      from pg_catalog.pg_constraint c
      where c.conindid = i.indexrelid
      limit 1
    )
    into
      v_index_oid,
      v_index_unique,
      v_index_key_count,
      v_index_attribute_count,
      v_index_first_attnum,
      v_index_has_expressions,
      v_index_method,
      v_index_predicate,
      v_backing_constraint
  from pg_catalog.pg_index i
  join pg_catalog.pg_class idx on idx.oid = i.indexrelid
  join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
  join pg_catalog.pg_namespace ns on ns.oid = idx.relnamespace
  join pg_catalog.pg_am am on am.oid = idx.relam
  where ns.nspname = 'public'
    and tbl.relname = 'payment_reconciliations'
    and idx.relname = 'payment_reconciliations_dedupe_unique';

  if v_index_oid is not null then
    if not v_index_unique
       or v_index_key_count <> 1
       or v_index_attribute_count <> 1
       or v_index_first_attnum <> v_dedupe_attnum
       or v_index_has_expressions
       or v_index_method <> 'btree' then
      raise exception 'refusing to replace unexpected payment_reconciliations_dedupe_unique definition';
    end if;

    if v_index_predicate is null then
      -- A compatible non-partial UNIQUE index or constraint already exists.
      return;
    end if;

    if v_backing_constraint is not null then
      raise exception 'refusing to drop constraint-backed index payment_reconciliations_dedupe_unique (%)', v_backing_constraint;
    end if;

    if pg_catalog.regexp_replace(
      pg_catalog.lower(v_index_predicate),
      '[[:space:]()"]',
      '',
      'g'
    ) <> 'dedupe_keyisnotnull' then
      raise exception 'refusing to replace unexpected partial predicate on payment_reconciliations_dedupe_unique: %', v_index_predicate;
    end if;

    drop index public.payment_reconciliations_dedupe_unique;
  end if;

  create unique index payment_reconciliations_dedupe_unique
    on public.payment_reconciliations(dedupe_key);
end
$migration$;
