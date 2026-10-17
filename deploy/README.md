# Deploy: crossing-risk at /app

The pod runs `python:3.12-slim` with no custom image. Everything is mounted from ConfigMaps and
rebuilt on every start, so a restart or reschedule loses nothing.

| File | Purpose |
|------|---------|
| `bootstrap.py` | At start: copies `events.json` into `/data`, downloads missing clips and sidecars from S3 (8 threads), makes missing thumbnails with ffmpeg (red person box, 960 px wide), copies hero jpgs. Idempotent; exits non-zero on any failure. |
| `start.sh` | `pip install boto3 imageio-ffmpeg`, runs bootstrap, assembles the static tree, then `exec python /app/backend/server.py` (port 8080). |
| `k8s.yaml` | Deployment (Recreate), Service (80 to 8080), Ingress `/app(/|$)(.*)` with rewrite `/$2`. |
| `deploy.sh` | Creates ConfigMaps and the S3 secret, applies the YAML, restarts, curls the health check. |

## Deploy (on the lab VM, from a checkout)

```bash
bash deploy/deploy.sh /path/to/events.json [hero1.jpg ...]
```

Needs `backend/*.py` and a built `frontend/dist/`. The script never prints secret values.

## Notes

- Each ConfigMap is limited to about 1 MiB; `deploy.sh` refuses any over 900 KB.
- ConfigMaps cannot hold subdirectories, so `frontend/dist` top-level files go to
  `crossing-risk-frontend` and `dist/assets/*` to `crossing-risk-frontend-assets`. `start.sh` merges
  them into `/tmp/static` (the `STATIC_DIR`). Directories deeper than `assets/` are not supported.
- `events.json` and hero images live in `crossing-risk-data` (mounted at `/config-data`).
- No PVC: PVCs bind but fail to mount (NFS `rpc.statd` error). `/data` is an emptyDir, refilled
  from S3 at start. First start is slow (pip install plus downloads); readiness allows about 10 minutes.
- Feedback written to `/data` is lost on restart.

## Roll back to the old app

```bash
export KUBECONFIG=/config/team-33-k8s.yaml
kubectl -n team-33 delete ingress crossing-risk
kubectl -n team-33 scale deploy/crossing-risk --replicas=0
kubectl -n team-33 scale deploy/floor-tracker --replicas=1
kubectl -n team-33 apply -f ~/floor-tracker-ingress.backup.yaml
```
