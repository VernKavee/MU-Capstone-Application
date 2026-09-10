---
status: accepted
---

# Web app on a self-hosted Supabase stack

The report specified a React Native app with a FastAPI backend, Firebase Auth, Google Cloud Storage, and Postgres with pgvector. The team switched to a web app, and the evaluation with about fifteen students needs full video kept per set, which the free cloud plan cannot hold. We build a Next.js App Router app against the Supabase API (Auth, Postgres with row-level security, Storage with signed upload URLs, pgvector) and run Supabase's own Docker stack plus Next.js on a team machine for the evaluation, reached over HTTPS through a free tunnel. The code does not know where Supabase runs, so the cloud free plan and the Pro plan stay drop-in alternatives.

## Considered options

| Option | Cost | Video capacity | Always on | Code differences |
|---|---|---|---|---|
| Supabase cloud free plus Vercel | none | 1 GB total, 50 MB per file, no full video | pauses after 7 idle days | none |
| Supabase cloud Pro plus Vercel | 25 USD per month | 100 GB | yes | none |
| Supabase cloud free plus Cloudflare R2 for video plus Vercel | none | 10 GB on R2, free egress | database pauses after 7 idle days | video upload targets R2's S3 API |
| Self-hosted Supabase Docker stack plus Next.js, chosen | none | the machine's disk | while the machine is on | none |
| Self-hosted plain Postgres, Auth.js, files on disk | none | the machine's disk | while the machine is on | auth, signed uploads, and storage written by hand |

Row-level security gives NFR2 at the database layer, signed upload URLs give NFR3 without proxying, and pgvector is available in every option. Firebase was rejected for having neither Postgres nor pgvector. Vercel Hobby functions run up to 300 seconds, so a hosted variant would not need a separate service for the LLM call.

## Consequences

- The team machine must stay awake and the tunnel up for the whole evaluation. Whether the evaluation is supervised sessions or unsupervised use over days is not yet known; if unsupervised, the Pro plan for those months is the fallback and needs no code change.
- The tunnel is chosen in Phase 1. Cloudflare Tunnel needs a domain; Tailscale Funnel does not.
- No SMTP server: email confirmation is off and there is no self-service password reset. A tester who forgets a password asks the team, who resets it in Supabase Studio.
- Backups of the database and of the video and keypoint files are the team's job.
- For the evaluation the team reads everyone's data directly: the service role in the database, the files on disk. There is no admin screen and no export feature.
- All data, including video, stays on the team machine in Thailand.
- The existing `.gitignore` is already Next.js shaped and is kept.
