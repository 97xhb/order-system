#!/bin/sh
set -eu

POSTGRES_USER="${POSTGRES_USER:-order_app}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
POSTGRES_DB="${POSTGRES_DB:-order_system}"

if [ -z "$POSTGRES_PASSWORD" ] ||
  [ "$POSTGRES_PASSWORD" = "replace_with_url_safe_random_password" ] ||
  [ "${POSTGRES_PASSWORD#CHANGE_ME_}" != "$POSTGRES_PASSWORD" ]; then
  echo "POSTGRES_PASSWORD 未设置或仍是示例值，请先填写部署配置" >&2
  exit 1
fi

case "$POSTGRES_PASSWORD" in
  *[!A-Za-z0-9._-]*)
    echo "POSTGRES_PASSWORD 只能使用字母、数字、点、下划线或短横线，避免 DATABASE_URL 编码错误" >&2
    exit 1
    ;;
esac

if [ -z "${DATA_ENCRYPTION_KEY:-}" ] ||
  [ "$DATA_ENCRYPTION_KEY" = "replace_with_a_long_random_key" ] ||
  [ "${DATA_ENCRYPTION_KEY#CHANGE_ME_}" != "$DATA_ENCRYPTION_KEY" ]; then
  echo "DATA_ENCRYPTION_KEY 未设置或仍是示例值，请先填写部署配置" >&2
  exit 1
fi

if [ "${#DATA_ENCRYPTION_KEY}" -lt 32 ]; then
  echo "DATA_ENCRYPTION_KEY 至少需要 32 个字符，推荐使用 64 位十六进制密钥" >&2
  exit 1
fi

# ADMIN_INITIAL_PASSWORD is validated by AdminBootstrapService only when the
# database has no administrator yet. Existing installations may omit it after
# the initial account has been created.

if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@db:5432/$POSTGRES_DB?schema=public"
fi

cd /app/apps/api

# 直接调用 Prisma CLI，避免 NAS 上 Corepack 读取工作区 package.json 时的权限差异。
PRISMA_CLI="/app/apps/api/node_modules/prisma/build/index.js"
if [ ! -r "$PRISMA_CLI" ]; then
  PRISMA_CLI="/app/node_modules/prisma/build/index.js"
fi
if [ ! -r "$PRISMA_CLI" ]; then
  echo "Prisma CLI 不存在或不可读: $PRISMA_CLI" >&2
  exit 1
fi

attempt=1
while ! node "$PRISMA_CLI" migrate deploy; do
  if [ "$attempt" -ge 30 ]; then
    echo "数据库迁移连续失败 30 次，停止启动 API" >&2
    exit 1
  fi
  echo "数据库尚未就绪，2 秒后重试（第 $attempt/30 次）" >&2
  attempt=$((attempt + 1))
  sleep 2
done

exec node dist/main.js
