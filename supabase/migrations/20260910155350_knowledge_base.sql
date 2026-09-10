-- Phase 6: the knowledge base that Sujira's feedback component retrieves from (ADR-0007),
-- created empty. Each chunk belongs to one exercise, so retrieval can be scoped to it.
--
-- The embedding model is not chosen, so `embedding` is pgvector's untyped vector: a vector
-- of any length goes in, and no vector index can be built until the length is fixed. At
-- integration: alter column embedding type extensions.vector(<dimension>), then create
-- an hnsw index on it.
create table public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  exercise_id text not null references public.exercises (id),
  content text not null check (length(content) > 0),
  embedding extensions.vector,
  created_at timestamptz not null default now()
);
create index knowledge_base_exercise_id on public.knowledge_base (exercise_id);

-- Like expert_motions: the component reads and writes it over a direct database
-- connection, never through the API. Row-level security with no policy, and no privilege
-- for either API role, so a request fails with a privilege error.
alter table public.knowledge_base enable row level security;
revoke all on public.knowledge_base from anon, authenticated;
