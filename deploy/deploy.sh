#!/usr/bin/env bash
# Run ON THE LAB VM from a repo checkout:  bash deploy/deploy.sh /path/to/events.json [hero.jpg ...]
set -euo pipefail
EVENTS="${1:?usage: deploy.sh /path/to/events.json [hero.jpg ...]}"
shift
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export KUBECONFIG=/config/team-33-k8s.yaml
NS=team-33
LIMIT=$((900*1024))
K="kubectl -n $NS"

check() { # label, files...
  local label=$1; shift
  local total=0 s f
  for f in "$@"; do s=$(wc -c < "$f"); total=$((total+s)); done
  echo "$label: $total bytes"
  [ "$total" -le "$LIMIT" ] || { echo "REFUSING: $label exceeds 900 KB"; exit 1; }
}

mapfile -t BACK < <(ls "$ROOT"/backend/*.py)
mapfile -t FRONT < <(find "$ROOT/frontend/dist" -maxdepth 1 -type f)
mapfile -t ASSETS < <(find "$ROOT/frontend/dist/assets" -maxdepth 1 -type f 2>/dev/null || true)
DATA=("$EVENTS" "$@")
BOOT=("$ROOT/deploy/bootstrap.py" "$ROOT/deploy/start.sh")
[ "${#BACK[@]}" -gt 0 ] && [ "${#FRONT[@]}" -gt 0 ] || { echo "missing backend/*.py or frontend/dist"; exit 1; }
check backend "${BACK[@]}"
check frontend "${FRONT[@]}"
if [ "${#ASSETS[@]}" -gt 0 ]; then check frontend-assets "${ASSETS[@]}"; fi
check data "${DATA[@]}"
check bootstrap "${BOOT[@]}"

cm() { # name, files...
  local name=$1; shift
  local args=() f
  for f in "$@"; do args+=(--from-file="$f"); done
  $K create configmap "$name" "${args[@]}" --dry-run=client -o yaml | $K apply -f -
}
cm crossing-risk-backend "${BACK[@]}"
cm crossing-risk-frontend "${FRONT[@]}"
if [ "${#ASSETS[@]}" -gt 0 ]; then
  cm crossing-risk-frontend-assets "${ASSETS[@]}"
else
  $K create configmap crossing-risk-frontend-assets --dry-run=client -o yaml | $K apply -f -
fi
cm crossing-risk-data "${DATA[@]}"
cm crossing-risk-bootstrap "${BOOT[@]}"

# Secret from the team config; values are never echoed.
(
  set -a; source /config/team-33.config; set +a
  $K create secret generic crossing-risk-s3 \
    --from-literal=S3_ENDPOINT="$S3_ENDPOINT" \
    --from-literal=ACCESS_KEY="$ACCESS_KEY" \
    --from-literal=SECRET_KEY="$SECRET_KEY" \
    --from-literal=S3_SEGMENTS_BUCKET="$S3_SEGMENTS_BUCKET" \
    --dry-run=client -o yaml | $K apply -f - > /dev/null
  echo "secret crossing-risk-s3 applied"
)

$K apply -f "$ROOT/deploy/k8s.yaml"
$K rollout restart deploy/crossing-risk
$K rollout status deploy/crossing-risk --timeout=600s

BASE=http://video-lab-team-33.cosmos.vastdata.com/app
for p in /api/health /; do
  printf '%s%s -> ' "$BASE" "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "$BASE$p" || true
done
