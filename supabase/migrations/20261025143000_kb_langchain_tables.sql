-- The knowledge base Sujira's feedback service retrieves from (ADR-0007). Decided
-- 2026-10-25 (RAG_SYSTEM docs/plans/app_integration_plan.md, D1 option A): the service and
-- its evaluation read langchain_postgres's own two tables, so they move here unchanged
-- instead of being rewritten onto public.knowledge_base, which stays as it was, unused.
--
-- They are created here, in the layout langchain_postgres 0.0.17 creates, so that the
-- library finds them and never creates them itself: a table it made in public would get the
-- API roles' default privileges. Rows are copied in over a direct database connection by
-- RAG_SYSTEM's tools/copy_kb.py, vectors included, and again after every `npm run db:reset`.
--
-- No vector index: retrieval is an exact nearest-neighbour scan, as it was when evaluated
-- (an hnsw index would make it approximate), over a few thousand rows.
create table public.langchain_pg_collection (
  uuid uuid primary key,
  name varchar not null unique,
  cmetadata json
);

create table public.langchain_pg_embedding (
  id varchar primary key,
  collection_id uuid references public.langchain_pg_collection (uuid) on delete cascade,
  embedding extensions.vector,
  document varchar,
  cmetadata jsonb
);
create index ix_cmetadata_gin on public.langchain_pg_embedding using gin (cmetadata jsonb_path_ops);

-- Like knowledge_base: row-level security with no policy, and no privilege for either API
-- role, so a request fails with a privilege error.
alter table public.langchain_pg_collection enable row level security;
alter table public.langchain_pg_embedding enable row level security;
revoke all on public.langchain_pg_collection, public.langchain_pg_embedding from anon, authenticated;
