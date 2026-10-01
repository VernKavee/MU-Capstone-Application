# Deployment plan

How Posture Coach gets from Vern's Mac to an address a stranger's phone can open.

**Status, 2026-10-01: decided, not rehearsed.** The professor confirmed that the website
must be published on AWS or a cloud provider, and that the group's project budget can pay
for it. Vern chose a Google Cloud VM: his student credit first, the project budget after.
Nothing here has been run. Commands and setting names marked "check
at the rehearsal" are from the documentation, not from a run.

The goal is a demonstration, not traffic: the professor opens an https address on his own
phone, registers, and does a workout.

## What runs where, on either route

- **On the user's device:** the camera, MediaPipe, and the rule engine (NFR1). The phone
  fetches the pose model and its wasm, about 10 MB, from Google's storage and jsdelivr on
  first use, so it needs the internet. The server's size does not affect the live screen.
- **On the server:** the Next.js app, Supabase (auth, Postgres, storage), and once per
  set, after it is saved, similarity and feedback (ADR-0007).
- **Browser to storage directly:** both files of a set upload straight to Supabase storage
  through a signed URL (NFR3), so the Supabase API must be reachable from the phone, not
  only the app.
- **https is required:** a phone allows the camera only on https. A plain link to a
  machine's IP on the same wifi does not work.

The app reads two settings, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, in `lib/supabase/client.ts`, `server.ts`, and
`proxy.ts`. Both are fixed into the build, so they are written before `npm run build`.
No route needs a code change.

## The demo secrets, which decide the design

`npx supabase start` uses Supabase's published local development secrets: the JWT secret
and the service role key are the same on every install and printed in Supabase's own
documentation. The CLI stack is built for local development; `supabase/config.toml` has a
commented `signing_keys_path`, which was not checked and is not assumed to retire the
published keys. Once the API is
public, anyone who knows the address can use the published service role key to skip
row-level security and read every user's rows, video, and medical history. That breaks
NFR2 and the consent text.

So:

- The CLI stack is for local development, and for a supervised demo with test accounts
  where the tunnel is closed afterwards.
- Anything left open to the internet with real testers' data runs Supabase's self-hosted
  Docker Compose with its own generated secrets.

## The two routes

| | Vern's Mac with Tailscale Funnel | Google Cloud VM |
|---|---|---|
| What it is | The Mac runs the app and the CLI stack; Funnel tunnels a public https address into it | A rented machine with its own public address runs the app and the self-hosted compose |
| Visitors need | A browser | A browser |
| Up when | The Mac is awake, online, and running the stack | Always |
| Address | `<mac>.<tailnet>.ts.net`, app on 443, API on 8443 | Two hostnames on 443, free through sslip.io or a bought domain |
| Cost | None | Roughly 25 to 50 USD a month by size, from Vern's student credit |
| Secrets | The published demo secrets | Generated |
| Fit | A supervised demo with test accounts | Left running, real testers, and the Python services |
| Setup | Minutes, already in ADR-0001 | About a day once, then the runbook |
| Other limits | Funnel is relayed and rate limited; a network that blocks port 8443 breaks sign-in and uploads; storage is the Mac's disk | The team maintains it: updates, backups, restarts; one machine, no redundancy |

Decided: the VM. The professor requires a published site, similarity and feedback are
both Python services that need a host beside the app, and the site must stay up without
Vern's laptop. AWS Lightsail and EC2 were the alternatives; the setup on the machine is
the same, so moving later changes only the console steps. The Mac with Funnel stays for
supervised phone tests during development.

## The VM layout

```
phone ── https ──> Caddy (80, 443)
                     ├─ app.<ip>.sslip.io  ──> Next.js, npm run start, port 3000 (systemd)
                     └─ api.<ip>.sslip.io  ──> Supabase API gateway, port 8000 (compose)

Next.js ── localhost ──> similarity service (Python, Punnapat)
        └─ localhost ──> feedback service (Python, Sujira)
Python services ── localhost ──> Postgres (expert_motions, knowledge_base)
```

- **Caddy** gets and renews the certificates by itself. `<ip>` is the VM's static address
  with dashes, for example `app.34-12-34-56.sslip.io`.
- **Firewall:** 80 and 443 open to everyone, SSH for the team. Postgres and Studio stay
  closed and are reached through an SSH tunnel.
- **Next.js** runs under systemd with restart on failure, and the compose services carry
  a restart policy, so the site returns after a reboot.
- **Moving to a bought domain:** two DNS records pointing at the VM, the two hostnames in
  the Caddyfile and in both env files, then a rebuild.

## Who does what

**Vern, with his Google account, because it needs his billing:**

1. A Google Cloud project with billing on the student credit, with the project budget
   taking over when the credit runs out or expires. Check both amounts and the expiry
   date, and set a billing alert below the budget.
2. A VM in `asia-southeast1` (Singapore): Ubuntu LTS, 2 vCPU and 8 GB of memory to start,
   a 50 GB disk, and a reserved static IP. The size is a starting guess for the stack plus
   `next build`; check it at the rehearsal.
3. Firewall rules for 80 and 443.

**On the VM:**

4. Install Docker, Node 22, and Caddy. Clone this repo and the `docker/` folder of the
   supabase repo.
5. Generate the secrets and fill the compose `.env` (next section). `docker compose up -d`.
6. Apply the schema from this repo: `npx supabase db push --db-url <the Postgres address
   on localhost>`. The four migrations carry the exercise catalogue and the `sets` bucket,
   so nothing is typed by hand. Check at the rehearsal.
7. Write `.env.production` with the API hostname and the compose stack's anon key, then
   `npm ci` and `npm run build`.
8. Install the systemd unit and the Caddyfile, and start both.
9. Start the two Python services, once they exist.

## Compose settings that differ from the local stack

`supabase/config.toml` configures only the CLI stack. On the VM the same choices are set
in the compose `.env`. The exact key names are checked against that file at the rehearsal.

| Choice | Local, in `config.toml` | On the VM |
|---|---|---|
| Secrets | published demo values | generated: JWT secret, anon key, service role key, Postgres password, dashboard password |
| Email confirmation | `enable_confirmations = false` | autoconfirm on, since there is no SMTP (ADR-0001); without it nobody can register |
| Largest file | `file_size_limit = "500MiB"` | raised to match; the compose default is likely lower |
| Public addresses | `site_url` on 127.0.0.1 | the site URL is the app hostname, the API's external URL is the API hostname |

## Stages

1. **Next, on the Mac.** Cut the video bitrate: `videoBitsPerSecond` on the
   recorder in `lib/live/session.ts`, between 1.5 and 2.5 Mbit/s, chosen by looking at a
   test recording. Today's recording is about 10 Mbit/s, 75 MB per minute. The cut changes
   only the file the replay plays; scoring reads the live frames and the keypoint file.
   Then a phone test through Funnel on the Mac, on Android Chrome and iOS Safari, with a
   test account and the tunnel closed afterwards.
2. **Mid-project, one afternoon.** A rehearsal deploy on a VM that is deleted afterwards.
   The deploy files (`deploy/Caddyfile`, the systemd unit, the env examples) are written
   and tested then, and this document loses its "not rehearsed" mark.
3. **Near the end.** The real deploy from this runbook, with the three real components.
   When the project ends, the VM and its disk are deleted, as the consent text promises.
   The consent text in `lib/consent.ts` names no location, so moving the data to Google's
   Singapore region needs no new consent version; ADR-0001's "stays on the team machine
   in Thailand" is what changes.

## Checks for the rehearsal and the real deploy

- The published demo service role key is refused by the public API. This one check proves
  the secrets were replaced.
- A fresh account cannot read another user's workout, set, or files.
  `e2e/isolation.spec.ts` shows the calls.
- From a phone on mobile data, off the team's network: register, consent, profile, a full
  set on the camera, both files saved, History shows the workout, the replay plays. Once
  on Android Chrome and once on iOS Safari. A failure on iOS blocks the demo.
- After a reboot of the VM the site comes back by itself.
- A backup and a restore: the two commands in `docs/HANDOVER.md`, under the compose
  stack's container and volume names.

## Known limits of the VM route

- No email, so no self-service password reset; the SQL statement in `docs/HANDOVER.md`
  still applies, through an SSH tunnel.
- Anyone with the link can register. The consent screen applies to them like any tester.
- sslip.io hostnames share a certificate quota with everyone who uses the service. If a
  certificate is refused, the way out is a bought domain.
- Video fills the disk first. The bitrate cut of stage 1 comes before any real use.
