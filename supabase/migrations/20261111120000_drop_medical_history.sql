-- No medical history (2026-11-11, Sujira's decision, docs/DECISIONS.md). PDPA approval for health
-- data could not be had in time, so the app stops collecting it and the PDPA work is dropped.
-- Dropping the column deletes every medical history already typed in.
alter table public.profiles drop column medical_history;

-- The consent screen asks for camera and recording only from CONSENT_VERSION 2 (lib/consent.ts).
-- Rows of kind 'profile' recorded under version 1 stay as they are: a consent is a fact with a
-- time, and the gate counts only rows of the current version, so they no longer count.
