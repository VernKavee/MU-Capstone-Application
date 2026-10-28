# Running real feedback on your own machine

This guide sets up the AI coaching feedback so the set-complete screen shows text written by a
language model instead of the stub. Feedback is Sujira's component: a Python service in the
RAG_SYSTEM repository that looks up the exercise knowledge base and asks the model for coaching.
The app calls it after every set (ADR-0007, `lib/analysis/feedback.ts`).

Without this setup the app still works: feedback comes from the stub and ends with "(Stub
feedback: no language model was called.)".

Last checked 2026-10-28 on Windows 11: a fresh clone of RAG_SYSTEM with only the service's
packages passed its tests, the knowledge base file restored to 2197 rows, and a squat set got its
feedback in about 14 seconds.

## What you need

- The app already running on your machine as in `README.md`: Node 22, Docker Desktop, `.env.local`,
  `npx supabase start`, and `npm run dev`.
- Python 3.10 (tested with 3.10.11) and Git.
- A free Groq API key: sign up at https://console.groq.com and create one at
  https://console.groq.com/keys. It starts with `gsk_`. Each person uses their own; never commit it.

The two data files come with the RAG_SYSTEM clone, in its `app_setup/` folder:
`kb_dump.sql.gz` (about 34 MB, the knowledge base: 2197 chunks with their vectors) and
`gemini-embedding-2.json` (about 1.8 MB, the search queries already turned into vectors, so a
request never calls Google).

On Windows, run every command below in **Git Bash** (installed with Git for Windows), not
PowerShell or cmd. On a Mac, use Terminal.

## 1. Bring the app up to date

```bash
cd MU-Capstone-Application
git pull
npm install
npx supabase start
npx supabase migration up --local
```

`migration up` adds the two knowledge base tables (`langchain_pg_collection` and
`langchain_pg_embedding`) without touching your users or sets. `npm run db:reset` would also work
but deletes all your local data.

## 2. Clone RAG_SYSTEM

Next to the app, on the branch the app uses:

```bash
cd ..
git -c core.longpaths=true clone -b app-integration https://github.com/sujira7236212/Capstone_RAG.git RAG_SYSTEM
cd RAG_SYSTEM
```

`core.longpaths=true` matters on Windows: some file names in the repository are long, and without
it the checkout fails with "Filename too long". The repository is public, so no GitHub access is
needed. Already cloned before? `git pull` inside it instead.

Every command from here on runs inside the RAG_SYSTEM folder.

## 3. Load the knowledge base

```bash
docker exec supabase_db_MU-Capstone-Application psql -U postgres -c "DELETE FROM langchain_pg_collection"
gzip -dc app_setup/kb_dump.sql.gz | docker exec -i supabase_db_MU-Capstone-Application psql -U postgres -q -v ON_ERROR_STOP=1
docker exec supabase_db_MU-Capstone-Application psql -U postgres -tAc "SELECT count(*) FROM langchain_pg_embedding"
```

The last line must print `2197`. The first line empties the tables so the load can be run again
safely; deleting the collection deletes its chunks with it.

The knowledge base survives `npx supabase stop` and `start`. It is emptied by `npm run db:reset`;
after a reset, run this step again.

## 4. Set up the feedback service

Create a virtual environment and install only what the service needs:

```bash
python -m venv .venv                 # on a Mac: python3 -m venv .venv
.venv/Scripts/python -m pip install -r service/requirements.txt    # on a Mac: .venv/bin/python
```

Put the query vectors where the service looks for them:

```bash
mkdir -p .cache/query_vectors
cp app_setup/gemini-embedding-2.json .cache/query_vectors/
```

Create a file named `.env` in the RAG_SYSTEM folder with these four lines, your Groq key in the
second:

```
FEEDBACK_LLM_PROVIDER=groq
GROQ_API_KEY=gsk_your_key_here
GOOGLE_API_KEY=not-used
KB_DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres
```

`GOOGLE_API_KEY` only has to exist: with the query vectors in place and Groq writing, no request
reaches Google. `.env` is ignored by Git.

Start the service and leave this terminal open:

```bash
.venv/Scripts/python -m service      # on a Mac: .venv/bin/python -m service
```

It listens on 127.0.0.1:8100 only. In a second terminal, check it:

```bash
curl http://127.0.0.1:8100/health
```

You should see `"ok":true`, `"rows":2197`, `"prompt":"v15a"`, and `"llm":"groq:qwen/qwen3.8-27b"`.

## 5. Point the app at the service

Add this line to the app's `.env.local` (it is already listed, empty, in `.env.example`):

```
FEEDBACK_URL=http://127.0.0.1:8100/feedback
```

Restart `npm run dev`, because Next reads `.env.local` only at start.

### Try it without the camera

From the app folder, send the example input to the service:

```bash
curl -s -H "content-type: application/json" --data-binary @docs/feedback-input-example.json http://127.0.0.1:8100/feedback
```

After 10 to 20 seconds you get `{"feedback": "...", "version": {...}}`, coaching for set 3 of a
squat workout.

### Try it in the app

Do one set as usual. On the set-complete screen, feedback appears after similarity, and it no
longer ends with "(Stub feedback ...)". The service's terminal logs one line per set with the time
taken and the chunks used; it never logs the profile or the feedback text.

## Every time after this

1. `npx supabase start` in the app folder.
2. `.venv/Scripts/python -m service` in RAG_SYSTEM (on a Mac `.venv/bin/python -m service`).
3. `npm run dev` in the app folder.

To stop: Ctrl+C in the service's terminal and in the dev server's, then `npx supabase stop`.

To pick up Sujira's changes to the service: `git pull` in RAG_SYSTEM and restart the service. If
the pull changed `app_setup/kb_dump.sql.gz`, load it again (step 3); if it changed
`app_setup/gemini-embedding-2.json`, copy it again (step 4).

## When something goes wrong

| What you see | Why | What to do |
|---|---|---|
| Feedback still ends with "(Stub feedback ...)" | The app does not see `FEEDBACK_URL` | Check the line in `.env.local`, then restart `npm run dev` |
| "Feedback failed: the feedback service is not reachable" | The service is not running | Start it (step 4) and press Retry |
| "Feedback failed: ... the language model is busy right now, try again in a minute" | Groq's free tier allows about one answer per minute | Wait a minute and press Retry |
| "Feedback failed: ... the exercise knowledge base is not reachable" | Supabase is down, or the tables are empty | `npx supabase start`; if `/health` shows `"rows":0`, redo step 3 |
| `/health` shows `"rows":0` after `npm run db:reset` | A reset empties the knowledge base | Redo step 3 |
| "Feedback failed: ... the language model could not write feedback this time" | Wrong or missing `GROQ_API_KEY` | Fix `.env` in RAG_SYSTEM and restart the service |
| The clone stops with "Filename too long" | Windows path limit | Clone again with `-c core.longpaths=true` as in step 2 |
| A few PDFs show as modified in `git status` in RAG_SYSTEM, and `/health` shows the commit with `-dirty` | Line-ending conversion on Windows | Harmless; leave them |
| `docker exec` says no such container | Supabase is not running, or the project folder has another name | `npx supabase start`, then `docker ps` to see the `supabase_db_...` name |

## What to expect from the text today

The feedback is real but not finished (prompt v15a, a free model):

- It is written in markdown, and the app does not render markdown, so `*` and `**` show as they
  are.
- It may speak of dropping the weight, which does not fit these bodyweight exercises.
- It sees only each fault's rule name, so it can misread one: in one test it described
  `knee_varus` (knees outside the toe line, "Keep knees in line") as knees caving in.
- Groq's free model is smaller than the Gemini model planned for the evaluation, and answers vary
  from run to run.

The medical history is not sent to the model yet; it waits for the consent wording and the rules
for using it (RAG_SYSTEM `docs/plans/app_integration_plan.md`, D6).

## For Sujira: making the two files again

In RAG_SYSTEM, with the app's Supabase running and its knowledge base filled:

```bash
docker exec supabase_db_MU-Capstone-Application pg_dump -U postgres --data-only --no-owner \
  -t public.langchain_pg_collection -t public.langchain_pg_embedding postgres | gzip > app_setup/kb_dump.sql.gz
cp .cache/query_vectors/gemini-embedding-2.json app_setup/
```

Make new ones whenever the collection changes (a new curation round or a different
`KB_COLLECTION`) or new queries are added to the cache by `tools/fill_query_cache.py`, then commit
them on `app-integration`. Each new dump adds about 34 MB to the repository's history, so only
when the collection really changed.
