-- Query 14: code-contract field existence and type compatibility.
with expected(table_name, column_name, expected_udt_name, dependency_group) as (
  values
    ('legal_documents', 'id', 'uuid', 'baseline'),
    ('legal_documents', 'document_type', 'text', 'baseline'),
    ('legal_documents', 'version', 'text', 'baseline'),
    ('legal_documents', 'title', 'text', 'baseline'),
    ('legal_documents', 'content', 'text', 'baseline'),
    ('legal_documents', 'content_hash', 'text', 'baseline'),
    ('legal_documents', 'status', 'text', 'baseline'),
    ('legal_documents', 'effective_at', 'timestamptz', 'baseline'),
    ('legal_documents', 'published_at', 'timestamptz', 'baseline'),
    ('legal_documents', 'published_by', 'uuid', 'baseline'),
    ('legal_documents', 'publish_reason', 'text', 'baseline'),
    ('legal_documents', 'created_at', 'timestamptz', 'baseline'),
    ('legal_documents', 'updated_at', 'timestamptz', 'baseline'),
    ('legal_documents', 'is_current', 'bool', 'enhanced_api_only'),
    ('legal_documents', 'archived_at', 'timestamptz', 'enhanced_api_only'),
    ('legal_documents', 'archived_by', 'uuid', 'enhanced_api_only'),
    ('order_agreement_acceptances', 'order_id', 'uuid', 'order_evidence'),
    ('order_agreement_acceptances', 'user_id', 'uuid', 'order_evidence'),
    ('order_agreement_acceptances', 'document_version_id', 'uuid', 'order_evidence'),
    ('order_agreement_acceptances', 'document_type', 'text', 'order_evidence'),
    ('order_agreement_acceptances', 'document_version', 'text', 'order_evidence'),
    ('order_agreement_acceptances', 'content_hash', 'text', 'order_evidence'),
    ('order_evidence_events', 'order_id', 'uuid', 'order_evidence'),
    ('order_evidence_events', 'metadata', 'jsonb', 'order_evidence'),
    ('orders', 'id', 'uuid', 'baseline_dependency'),
    ('profiles', 'id', 'uuid', 'baseline_dependency'),
    ('profiles', 'role', 'text', 'baseline_dependency')
)
select
  '14-contract-compatibility-summary'::text as query_id,
  e.dependency_group,
  e.table_name,
  e.column_name,
  e.expected_udt_name,
  c.udt_name as actual_udt_name,
  (c.column_name is not null) as column_exists,
  (c.udt_name = e.expected_udt_name) as type_matches
from expected e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = e.table_name
 and c.column_name = e.column_name
order by e.dependency_group, e.table_name, e.column_name;
