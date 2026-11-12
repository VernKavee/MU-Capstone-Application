# Entity relationship diagram

How the data is stored, from `supabase/migrations/`. Mermaid: open the Markdown preview.

```mermaid
erDiagram
  AUTH_USERS ||--o| PROFILES : "has one"
  AUTH_USERS ||--o{ CONSENTS : "grants"
  AUTH_USERS ||--o{ WORKOUTS : "does"
  EXERCISES ||--o{ WORKOUTS : "is done in"
  WORKOUTS ||--o{ SETS : "owns"
  EXERCISES ||--o| EXPERT_MOTIONS : "has"
  LANGCHAIN_PG_COLLECTION ||--o{ LANGCHAIN_PG_EMBEDDING : "holds"

  AUTH_USERS {
    uuid id PK "Supabase Auth, not ours"
  }

  PROFILES {
    uuid user_id PK, FK
    text display_name
    int age
    text gender "female, male, other"
    numeric weight_kg
    numeric height_cm
    timestamptz created_at
    timestamptz updated_at
  }

  CONSENTS {
    uuid user_id PK, FK
    text kind PK "camera, recording (profile: version 1 only)"
    int version PK
    timestamptz granted_at
  }

  EXERCISES {
    text id PK "slug: squat, push-up, lunge, bicep-curl"
    text name
    smallint sort_order UK
    text guide_text
    text thumbnail_url "null until the media exists"
    text guide_video_url "null until the media exists"
    text engine_key
    jsonb rule_based_logic "thresholds, rules, messages per locale"
    boolean landscape "phone sideways (push-up)"
    text camera_hint "where to put the phone"
  }

  WORKOUTS {
    uuid id PK
    uuid user_id FK
    text exercise_id FK
    int target_reps
    int target_sets
    int rest_seconds
    text side "left or right, bicep curl only"
    timestamptz started_at
    timestamptz ended_at "null while in progress"
  }

  SETS {
    uuid id PK
    uuid workout_id FK
    int set_no "unique with workout_id and kind"
    text kind "initial or repair"
    text ended_by "target_reached, user_ended, attempt_cap"
    boolean repair_declined
    timestamptz started_at
    timestamptz ended_at
    jsonb totals
    jsonb attempts "one merged record per attempt"
    jsonb engine_report "verbatim, schema version 4"
    text engine_version
    text keypoints_url "object path in the sets bucket"
    text video_url "object path in the sets bucket"
    jsonb similarity "null until analysed"
    text llm_feedback "null until analysed"
    timestamptz created_at
  }

  EXPERT_MOTIONS {
    text exercise_id PK, FK
    bytea motion_data
    timestamptz updated_at
  }

  LANGCHAIN_PG_COLLECTION {
    uuid uuid PK
    varchar name UK "one knowledge base collection"
    json cmetadata
  }

  LANGCHAIN_PG_EMBEDDING {
    varchar id PK
    uuid collection_id FK
    vector embedding
    varchar document "the chunk's text"
    jsonb cmetadata "the chunk's metadata"
  }
```

## What the diagram does not show

- Deleting a user cascades to their profile, consents, and workouts, and a workout cascades
  to its sets. `workouts.exercise_id` does not cascade.
- `sets.video_url` and `sets.keypoints_url` are not foreign keys. They are object paths,
  `<user_id>/<set_id>/video.webm` (or `.mp4`) and `<user_id>/<set_id>/keypoints.json.gz`, in
  the private `sets` storage bucket, whose policies allow a user only their own folder.
- Access is enforced by row-level security. `profiles`, `consents`, `workouts`, and `sets`
  are readable only by their owner (`sets` through its workout). `exercises` is read-only
  for signed-in users. `expert_motions` and the two `langchain_pg_*` tables have no app
  privilege at all; Punnapat's and Sujira's components write them directly.
- The knowledge base Sujira's feedback service retrieves from is langchain_postgres's own two
  tables, kept in its layout so the library uses them unchanged (2026-10-25). They are not
  linked to `exercises`; a chunk's exercise is in its metadata. Deleting a collection deletes
  its chunks.
- `public.knowledge_base`, made in September for this, was never used and is left out of the
  diagram. It is empty.
