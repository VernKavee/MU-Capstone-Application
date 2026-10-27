-- Similarity from Punnapat's service (ADR-0007, 2026-10-27). The stub's numbers were fake and in
-- the report's six keys (overall and five regions), which the screens no longer read; clear them
-- from every set and attempt record. A retry re-scores a set whose keypoint file carries
-- frame_size; files saved before 2026-10-27 lack it, so those sets stay without similarity.
update public.sets
set similarity = null,
    attempts = (
      select coalesce(jsonb_agg(a || '{"similarity": null}'::jsonb order by n), '[]'::jsonb)
      from jsonb_array_elements(attempts) with ordinality as t(a, n)
    )
where similarity is not null
   or exists (select 1 from jsonb_array_elements(attempts) a where a->'similarity' <> 'null'::jsonb);
