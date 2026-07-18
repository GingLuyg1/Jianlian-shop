-- Query 13: aggregate legal-document counts only, with no title, version, content, hash or user data.
select
  '13-document-status-summary'::text as query_id,
  case when grouping(document_type) = 1 then 'TOTAL' else 'TYPE_STATUS' end as summary_level,
  document_type,
  status,
  count(*) as record_count,
  count(*) filter (where effective_at is null or effective_at <= now()) as effective_or_unscheduled_count,
  count(*) filter (where published_at is not null) as has_published_timestamp_count
from public.legal_documents
group by grouping sets ((document_type, status), ())
order by grouping(document_type), document_type nulls last, status nulls last;
