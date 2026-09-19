#!/bin/sh
# 把旧版本 docker-compose.yml 顶部 x-order-system-config 里的配置，
# 迁移到新版本使用的 .env.docker，避免手工抄密码出错。
#
# 用法（在项目目录内执行）：
#   sh scripts/migrate-to-env-docker.sh 旧版docker-compose.yml备份文件
#
# 脚本只读取旧文件、生成 .env.docker，不会修改或删除任何数据。
set -eu

cd "$(dirname "$0")/.."

old_file="${1:-}"
if [ -z "$old_file" ]; then
  echo '用法：sh scripts/migrate-to-env-docker.sh 旧版docker-compose.yml备份文件' >&2
  exit 1
fi

if [ ! -f "$old_file" ]; then
  echo "找不到旧配置文件：$old_file" >&2
  exit 1
fi

if [ -f .env.docker ]; then
  printf '%s' '.env.docker 已存在。输入 OVERWRITE 覆盖（会先自动备份），其他输入退出: '
  read -r answer || answer=''
  if [ "$answer" != 'OVERWRITE' ]; then
    echo '已保留现有 .env.docker。'
    exit 0
  fi
  mv .env.docker ".env.docker.backup-$(date +%Y%m%d-%H%M%S)"
  echo '原 .env.docker 已重命名备份。'
fi

# 从旧文件里取出 'xxx: &anchor 值' 这种写法的值。
read_anchor() {
  key="$1"
  fallback="$2"
  value="$(sed -n "s/^[[:space:]]*${key}:[[:space:]]*&[A-Za-z0-9_-]*[[:space:]]*['\"]\{0,1\}\([^'\"]*\)['\"]\{0,1\}[[:space:]]*$/\1/p" "$old_file" | head -n 1)"
  if [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf '%s' "$fallback"
  fi
}

database_name="$(read_anchor 'database-name' 'order_system')"
database_user="$(read_anchor 'database-user' 'order_app')"
database_password="$(read_anchor 'database-password' '')"
encryption_key="$(read_anchor 'data-encryption-key' '')"
admin_username="$(read_anchor 'admin-username' 'admin')"
admin_display_name="$(read_anchor 'admin-display-name' '管理员')"
admin_password="$(read_anchor 'admin-initial-password' '')"
web_origin="$(read_anchor 'web-origin' 'http://localhost:8191')"
allowed_hosts="$(read_anchor 'initial-allowed-hosts' 'localhost')"
host_port="$(sed -n "s/.*0\.0\.0\.0:\([0-9]\{1,5\}\):8190.*/\1/p" "$old_file" | head -n 1)"
[ -n "$host_port" ] || host_port='8191'

if [ -z "$database_password" ] || [ -z "$encryption_key" ]; then
  echo '未能从旧文件读取数据库密码或数据加密 Key。' >&2
  echo '请确认传入的是旧版本 docker-compose.yml，或者手动复制 .env.docker.example 并填写。' >&2
  exit 1
fi

cat > .env.docker <<EOF
COMPOSE_PROJECT_NAME=order-system

WEB_BIND_ADDRESS=0.0.0.0
WEB_HOST_PORT=${host_port}
WEB_ORIGIN=${web_origin}
INITIAL_ALLOWED_HOSTS=${allowed_hosts}

POSTGRES_DB=${database_name}
POSTGRES_USER=${database_user}
POSTGRES_PASSWORD=${database_password}

API_PORT=3000
TRUST_PROXY=172.30.0.0/24
DATA_ENCRYPTION_KEY=${encryption_key}

ADMIN_USERNAME=${admin_username}
ADMIN_DISPLAY_NAME=${admin_display_name}
ADMIN_INITIAL_PASSWORD=${admin_password}
ADMIN_SESSION_TTL_DAYS=30
ADMIN_SESSION_COOKIE=order_admin_session
ADMIN_ENTRY_TTL_DAYS=30
ADMIN_ENTRY_COOKIE=order_admin_entry
ADMIN_COOKIE_SECURE=auto

EXTERNAL_SESSION_TTL_DAYS=365
EXTERNAL_SESSION_COOKIE=order_external_session
EXTERNAL_COOKIE_SECURE=auto

LOCAL_RUNTIME_STATE_PATH=/var/lib/order-system/runtime-control.json
EOF

chmod 600 .env.docker

echo
echo '已根据旧配置生成 .env.docker：'
echo "  数据库名称：${database_name}"
echo "  数据库账号：${database_user}"
echo "  数据库密码：已写入（终端不显示）"
echo "  加密 Key：已写入（终端不显示）"
echo "  管理员账号：${admin_username}"
echo "  访问端口：${host_port}"
echo
echo '检查确认后执行：'
echo '  docker compose --env-file .env.docker up -d --build'
echo
echo '注意：数据库密码和数据加密 Key 必须与旧部署完全一致，否则无法连接或解密旧数据。'
