#!/bin/bash
set -u

PROJECT_DIR="${UPDATE_PROJECT_DIR:-/workspace}"
RUNTIME_DIR="${UPDATE_RUNTIME_DIR:-/runtime}"
REPO_URL="${UPDATE_REPO_URL:-https://codeload.github.com/97xhb/order-system/tar.gz/refs/heads/main}"
REQUEST_PATH="$RUNTIME_DIR/update-request.json"
PROCESSING_PATH="$RUNTIME_DIR/update-request.processing.json"
STATUS_PATH="$RUNTIME_DIR/update-status.json"
mkdir -p "$RUNTIME_DIR" "$PROJECT_DIR/backups"

write_status() {
  local state="$1"
  local version="${2:-}"
  local message="${3:-}"
  local started_at="${4:-}"
  jq -n \
    --arg state "$state" \
    --arg version "$version" \
    --arg message "$message" \
    --arg startedAt "$started_at" \
    --arg updatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      state: $state,
      version: (if $version == "" then null else $version end),
      message: (if $message == "" then null else $message end),
      startedAt: (if $startedAt == "" then null else $startedAt end),
      updatedAt: $updatedAt
    }' > "$STATUS_PATH.tmp"
  mv "$STATUS_PATH.tmp" "$STATUS_PATH"
}

run_update() {
  local version="$1"
  local stamp log_path backup_path tarball
  stamp="$(date +%Y%m%d-%H%M%S)"
  log_path="$PROJECT_DIR/backups/online-update-$stamp.log"
  backup_path="$PROJECT_DIR/backups/pre-update-online-$stamp.dump"
  tarball="/tmp/order-system-$stamp.tar.gz"

  exec >>"$log_path" 2>&1
  echo "==> online update $version started at $stamp"
  cd "$PROJECT_DIR"

  if [ ! -f docker-compose.yml ] || [ ! -f .env.docker ]; then
    echo "missing docker-compose.yml or .env.docker"
    return 1
  fi

  echo "==> backup database"
  docker compose --env-file .env.docker exec -T db \
    sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_path"

  echo "==> download source"
  curl -fL --retry 3 --connect-timeout 15 -o "$tarball" "$REPO_URL"
  tar -xzf "$tarball" -C "$PROJECT_DIR" --strip-components=1
  rm -f "$tarball"

  echo "==> build api web"
  docker compose --env-file .env.docker build api web

  echo "==> restart api web"
  docker compose --env-file .env.docker up -d api web

  echo "==> wait for services"
  for _ in $(seq 1 60); do
    running="$(docker compose --env-file .env.docker ps --status running --format '{{.Service}}' 2>/dev/null || true)"
    if printf '%s\n' "$running" | grep -qx api &&
      printf '%s\n' "$running" | grep -qx web; then
      echo "update completed"
      return 0
    fi
    sleep 2
  done
  echo "services did not become ready in time"
  return 1
}

write_status IDLE
echo "order-system updater ready"

while true; do
  if [ -f "$REQUEST_PATH" ] && [ ! -f "$PROCESSING_PATH" ]; then
    mv "$REQUEST_PATH" "$PROCESSING_PATH"
    version="$(jq -r '.version // empty' "$PROCESSING_PATH" 2>/dev/null || true)"
    started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    write_status RUNNING "$version" "正在下载并构建新版本" "$started_at"

    if run_update "$version"; then
      write_status SUCCESS "$version" "更新完成，服务已重启" "$started_at"
    else
      log_file="$(ls -1t "$PROJECT_DIR"/backups/online-update-*.log 2>/dev/null | head -1 || true)"
      message="更新失败，请查看备份目录中的在线更新日志"
      if [ -n "$log_file" ]; then
        message="$message：$(basename "$log_file")"
      fi
      write_status FAILED "$version" "$message" "$started_at"
    fi
    mv "$PROCESSING_PATH" "$RUNTIME_DIR/update-request.failed.json" 2>/dev/null || true
  else
    current_status="$(jq -r '.state // "IDLE"' "$STATUS_PATH" 2>/dev/null || echo IDLE)"
    if [ "$current_status" = "IDLE" ]; then
      write_status IDLE
    else
      write_status "$current_status" "$(jq -r '.version // empty' "$STATUS_PATH" 2>/dev/null || true)" \
        "$(jq -r '.message // empty' "$STATUS_PATH" 2>/dev/null || true)" \
        "$(jq -r '.startedAt // empty' "$STATUS_PATH" 2>/dev/null || true)"
    fi
  fi
  sleep 10
done
