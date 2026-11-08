-- The analysis of a set is written by the server only (2026-11-03, ADR-0007). The analyse
-- step reads the set with the user's own client, so row-level security proves it is theirs,
-- then writes similarity, the scores merged into the attempt records, and the feedback with
-- the service role. A user keeps the right to record a skipped repair set and the paths of
-- the two files they uploaded, and can no longer rewrite their attempt records, similarity,
-- or feedback through the API.
revoke update (attempts, similarity, llm_feedback) on public.sets from authenticated;
