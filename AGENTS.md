# AGENTS.md: team 33, VAST Builders Challenge London (17 Oct 2026)

Instructions for any coding agent (Claude Code, Cursor, Codex, Cline) working in this repo.
Read `README.md` for what we are building, then `ENVIRONMENT.md` for every lab fact.

## What this is

A video agent built on top of a pre-running NVIDIA VSS stack (VAST Data storage and database,
NVIDIA Cosmos and YOLO models on shared GPUs). We build on top of the stack; we never redeploy it.
Current idea: **pedestrian crossing risk for self-driving cars** (see `README.md`).
Submission is due at **16:30 BST**; code freeze 15:45.

## Where code runs

- All lab access (backend API, S3, VastDB, GPU models, kubectl) works only from the lab VM.
  Run commands there over SSH and load the credentials inside the same command:
  ```bash
  ssh bc-systerr 'bash -s' <<'REMOTE'
  set -a; source /config/team-33.config; set +a
  # commands here
  REMOTE
  ```
  `bc-systerr` is one teammate's VM alias; use your own.
- Python 3.12. The VM has no Node and no Docker. A venv with `requests boto3 openai weave vastdb
  opencv-python-headless numpy` is at `~/exp/venv` on the VM.
- Pass `-nostdin` to ffmpeg inside an SSH heredoc, or it swallows the rest of the script.

## Credentials (hard rules)

- Credentials exist only on the VM in `/config/team-33.config`. Never copy them off the VM,
  never print them, never commit them. List variable names with `env | cut -d= -f1 | sort`;
  never run bare `env` or `printenv`.
- `INGRESS_URL` already includes `http://`. TLS on S3 and the backend is self-signed: `verify=False`.

## Event rules

- Source: `vendor/vast-builders-challenge/.cursor/rules/build-day.mdc` (a copy of the event repo, see below).
- Use only the provided footage. **Never ingest video from the internet.** Uploads are accepted
  but not processed: the Segmenter is not in the challenge path.
- Do not rebuild or redeploy the organisers' DataEngine pipeline. Our own processing runs in our
  own code: on the VM, or as Deployments, Jobs or CronJobs in namespace `team-33`.
- Keep bulk re-ingests small (a few chunks, never hours). The GPU models are shared by every team:
  keep at most 2 to 3 calls in flight.
- Build a web app, CLI or script, never a native desktop or mobile app.

## Skills

- `.claude/skills/` links into the event repo's skills at `vendor/vast-builders-challenge/.cursor/skills/`.
  That folder is a plain copy of https://github.com/vast-data/vast-builders-challenge; see
  `vendor/vast-builders-challenge/VENDORED.md` for the source commit and how to refresh it.
- Skill commands assume the VM, so run them through SSH as above. Where a skill says `AskQuestion`,
  use your agent's ask-the-user tool.
- `ENVIRONMENT.md`, section "Gotchas found today", lists where the skills are wrong
  (for example Embed1 `request_type`, the Canary `model` field, box coordinates).

## Deploying

- Use the `deploy-app-no-registry` skill: public `python:3.12-slim` image, code from a ConfigMap
  (about 1 MiB max), Ingress path `/app` on `video-lab-team-33.cosmos.vastdata.com`.
- Pods cannot resolve the team host: call the backend at `http://video-backend-service:8000`.
- PersistentVolumeClaims bind but fail to mount (NFS `rpc.statd` error), so use `emptyDir`
  and treat pod storage as temporary.
- Judges open https://workshop.thecosmoslabs.com and click **App**. Only one app can own `/app`.

## Conventions

- Keep dependencies light (standard library, `requests`, `boto3`). The deploy image installs with pip at start.
- No secrets, footage or large data files in git. Generated data goes under `data/` (ignored).
- Mark experiments as throwaway in their header comment until the team decides to keep them.
