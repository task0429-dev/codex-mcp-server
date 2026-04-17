-- C2 Memory System baseline schema (v1)
create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists memory_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists sources (
  id text primary key,
  name text not null,
  source_type text not null,
  capture_mode text not null,
  raw_or_mirror text not null,
  reliability_tier text not null,
  completeness_hint double precision not null default 0,
  ordering_trust_hint double precision not null default 0,
  source_mutability text not null,
  inaccessible_native boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completeness_hint >= 0 and completeness_hint <= 1),
  check (ordering_trust_hint >= 0 and ordering_trust_hint <= 1)
);
create index if not exists idx_sources_type_active on sources(source_type, active);

create table if not exists source_records (
  id uuid primary key,
  source_id text not null references sources(id),
  source_type text not null,
  capture_mode text not null,
  source_record_id text not null,
  captured_at timestamptz not null,
  event_time timestamptz,
  ordering_key text,
  source_mutability text not null,
  source_trust_score double precision not null default 0,
  completeness_score double precision not null default 0,
  segment_status text not null default 'complete',
  payload_hash text not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now(),
  check (source_trust_score >= 0 and source_trust_score <= 1),
  check (completeness_score >= 0 and completeness_score <= 1)
);
create unique index if not exists uq_source_records_source_record on source_records(source_id, source_record_id);
create index if not exists idx_source_records_captured_at on source_records(captured_at desc);
create index if not exists idx_source_records_event_time on source_records(event_time desc);

create table if not exists conversations (
  id uuid primary key,
  namespace_scope_type text not null,
  namespace_scope_id text not null,
  integrity_status text not null default 'complete',
  title text,
  first_event_at timestamptz,
  last_event_at timestamptz,
  summary_ref uuid,
  primary_entities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_conversations_scope_updated on conversations(namespace_scope_type, namespace_scope_id, last_event_at desc);
create index if not exists idx_conversations_integrity on conversations(integrity_status);

create table if not exists conversation_messages (
  id uuid primary key,
  conversation_id uuid not null references conversations(id),
  source_record_id uuid references source_records(id),
  actor_type text not null,
  actor_id text not null,
  role text,
  content text not null,
  event_time timestamptz not null,
  sequence_num bigint,
  token_count integer,
  redaction_state text not null default 'none',
  importance_score double precision not null default 0,
  lexical_tsv tsvector,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  check (importance_score >= 0 and importance_score <= 1)
);
create index if not exists idx_conversation_messages_conversation_time on conversation_messages(conversation_id, event_time);
create unique index if not exists uq_conversation_messages_source_record on conversation_messages(source_record_id) where source_record_id is not null;
create index if not exists idx_conversation_messages_fts on conversation_messages using gin(lexical_tsv);

create table if not exists conversation_events (
  id uuid primary key,
  conversation_id uuid not null references conversations(id),
  message_id uuid references conversation_messages(id),
  source_record_id uuid references source_records(id),
  event_type text not null,
  event_time timestamptz not null,
  tool_name text,
  status text,
  severity text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_conversation_events_conversation_time on conversation_events(conversation_id, event_time);
create index if not exists idx_conversation_events_type_severity on conversation_events(event_type, severity);

create table if not exists entities (
  id uuid primary key,
  entity_type text not null,
  canonical_name text not null,
  aliases jsonb not null default '[]'::jsonb,
  external_refs jsonb not null default '{}'::jsonb,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_entities_type_name on entities(entity_type, canonical_name);
create index if not exists idx_entities_name_trgm on entities using gin(canonical_name gin_trgm_ops);

create table if not exists memory_objects (
  id uuid primary key,
  type text not null,
  title text not null,
  normalized_statement text not null,
  status text not null,
  review_state text,
  owner_scope_type text,
  owner_scope_id text,
  confidence_score double precision not null,
  freshness_score double precision not null,
  importance_score double precision not null,
  evidence_count integer not null default 0,
  redaction_state text not null default 'none',
  superseded_by uuid references memory_objects(id),
  lexical_tsv tsvector,
  embedding vector(1536),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (confidence_score >= 0 and confidence_score <= 1),
  check (freshness_score >= 0 and freshness_score <= 1),
  check (importance_score >= 0 and importance_score <= 1)
);
create index if not exists idx_memory_objects_type_status on memory_objects(type, status);
create index if not exists idx_memory_objects_confidence on memory_objects(confidence_score desc);
create index if not exists idx_memory_objects_fts on memory_objects using gin(lexical_tsv);

create table if not exists memory_links (
  id uuid primary key,
  from_object_id uuid not null references memory_objects(id),
  to_object_id uuid not null references memory_objects(id),
  link_type text not null,
  strength double precision not null default 0,
  created_at timestamptz not null default now(),
  check (strength >= 0 and strength <= 1)
);
create unique index if not exists uq_memory_links_rel on memory_links(from_object_id, to_object_id, link_type);
create index if not exists idx_memory_links_from on memory_links(from_object_id);
create index if not exists idx_memory_links_to on memory_links(to_object_id);

create table if not exists tags (
  id uuid primary key,
  namespace_scope_type text not null,
  namespace_scope_id text not null,
  key text not null,
  label text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_tags_scope_key on tags(namespace_scope_type, namespace_scope_id, key);
create index if not exists idx_tags_status_label on tags(status, label);

create table if not exists tag_bindings (
  id uuid primary key,
  tag_id uuid not null references tags(id),
  target_type text not null,
  target_id uuid not null,
  bound_by text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_tag_bindings_target on tag_bindings(tag_id, target_type, target_id);
create index if not exists idx_tag_bindings_target on tag_bindings(target_type, target_id);

create table if not exists index_jobs (
  id uuid primary key,
  job_type text not null,
  target_type text not null,
  target_id uuid,
  status text not null,
  attempts integer not null default 0,
  scheduled_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  worker_id text,
  error_code text,
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_index_jobs_status_scheduled on index_jobs(status, scheduled_at);
create index if not exists idx_index_jobs_type_status on index_jobs(job_type, status);

create table if not exists health_events (
  id uuid primary key,
  component text not null,
  severity text not null,
  event_time timestamptz not null,
  source_id text,
  message text not null,
  metric_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_health_events_component_time on health_events(component, event_time desc);
create index if not exists idx_health_events_severity_time on health_events(severity, event_time desc);

create table if not exists audit_log (
  id uuid primary key,
  actor_id text not null,
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  request_id text not null,
  before_hash text,
  after_hash text,
  approval_ref text,
  details_json jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null
);
create index if not exists idx_audit_log_target on audit_log(target_type, target_id, timestamp desc);
create index if not exists idx_audit_log_actor on audit_log(actor_id, timestamp desc);

create table if not exists archive_records (
  id uuid primary key,
  target_type text not null,
  target_id uuid not null,
  archived_at timestamptz not null,
  archived_by text not null,
  reason text not null,
  restore_at timestamptz,
  restored_by text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_archive_records_active on archive_records(target_type, target_id) where restore_at is null;

insert into memory_schema_migrations(version) values ('0001_memory_baseline')
on conflict (version) do nothing;
