#!/bin/sh
# 一次性升级脚本：把旧版（密码写在 docker-compose.yml 顶部）平滑升级到
# 新版（密码放在 .env.docker，以后可一条命令更新）。
#
# 用法：在旧版项目目录内执行
#   cd /vol1/1000/docker/order-system
#   sh scripts/upgrade-old-to-env-docker.sh
#
# 或者不下载项目也能用（会自动拉取最新代码）：
#   cd /vol1/1000/docker/order-system
#   sh -c "$(curl -fsSL https://raw.githubusercontent.com/97xhb/order-system/main/scripts/upgrade-old-to-env-docker.sh)"
#
# 脚本会做的事：
#   1. 备份旧 docker-compose.yml
#   2. 用旧配置导出一份数据库备份
#   3. 下载最新源码并覆盖程序文件
#   4. 根据旧配置自动生成 .env.docker（数据库卷和业务数据都保留）
#   5. 重新构建并启动容器
set -eu

REPO_OWNER='97xhb'
REPO_NAME='order-system'
REPO_BRANCH='main'

project_dir="$(pwd)"
stamp="$(date +%Y%m%d-%H%M%S)"

echo '=================================================='
echo ' 下单登记系统：旧版升级到新部署结构'
echo '=================================================='
echo "项目目录：$project_dir"
echo

if [ ! -f docker-compose.yml ]; then
  echo '当前目录找不到 docker-compose.yml。' >&2
  echo '请先 cd 到项目目录（能看到 apps、docker、docker-compose.yml 的那一层）。' >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo '找不到 docker 命令，请确认在飞牛 NAS 上执行。' >&2
  exit 1
fi

is_old_format=0
if grep -q 'x-order-system-config:' docker-compose.yml; then
  is_old_format=1
  echo '检测到旧版配置格式（x-order-system-config）。'
else
  echo '当前 docker-compose.yml 已经是新版格式，无需迁移配置。'
fi

# ---------------------------------------------------------------
# 1. 备份旧配置
# ---------------------------------------------------------------
old_compose="$project_dir/.old-docker-compose-$stamp.yml"
cp docker-compose.yml "$old_compose"
echo "已备份旧配置：$old_compose"

# ---------------------------------------------------------------
# 2. 导出数据库备份（用旧配置里的账号密码）
# ---------------------------------------------------------------
if [ "$is_old_format" = '1' ]; then
  read_anchor() {
    key="$1"
    sed -n "s/^[[:space:]]*${key}:[[:space:]]*&[A-Za-z0-9_-]*[[:space:]]*['\"]\{0,1\}\([^'\"]*\)['\"]\{0,1\}[[:space:]]*$/\1/p" "$old_compose" | head -n 1
  }
  old_db="$(read_anchor 'database-name')"
  old_user="$(read_anchor 'database-user')"
  [ -n "$old_db" ] || old_db='order_system'
  [ -n "$old_user" ] || old_user='order_app'

  echo '导出数据库备份（用于万一需要回滚）...'
  if docker compose -f docker-compose.yml ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^db$'; then
    if docker compose -f docker-compose.yml exec -T db \
      pg_dump -U "$old_user" -d "$old_db" -Fc > "$project_dir/order-backup-$stamp.dump" 2>/dev/null; then
      echo "数据库备份已生成：order-backup-$stamp.dump"
    else
      echo '数据库备份未成功（可能是容器名不同），继续升级，不影响数据卷。' >&2
    fi
  else
    echo '数据库容器当前未运行，跳过导出备份（数据卷仍然保留）。'
  fi
fi

# ---------------------------------------------------------------
# 3. 下载最新源码
# ---------------------------------------------------------------
if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
  echo '系统里没有 curl 或 wget，无法下载源码。' >&2
  exit 1
fi

tarball_url="https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${REPO_BRANCH}"
tarball="$project_dir/.order-system-update.tar.gz"

echo "下载最新源码：$tarball_url"
if command -v curl >/dev/null 2>&1; then
  curl -fL --retry 3 --connect-timeout 15 -o "$tarball" "$tarball_url"
else
  wget -O "$tarball" "$tarball_url"
fi

if [ ! -s "$tarball" ]; then
  echo '下载失败，已中止升级，旧部署未改动。' >&2
  exit 1
fi

echo '解压并覆盖程序文件...'
tar -xzf "$tarball" -C "$project_dir" --strip-components=1
rm -f "$tarball"

# 旧版本包同时存在 compose.yaml 和 docker-compose.yml，会让 Compose 报
# "Found multiple config files"，这里删掉旧的 compose.yaml。
if [ -f compose.yaml ]; then
  mv compose.yaml ".compose.yaml.old-$stamp"
  echo '已将旧 compose.yaml 重命名为备份，避免 Compose 选错文件。'
fi

echo '程序文件已更新。'

# ---------------------------------------------------------------
# 4. 生成 .env.docker
# ---------------------------------------------------------------
if [ -f .env.docker ]; then
  cp .env.docker ".env.docker.bak-$stamp"
  echo "已备份现有 .env.docker 为 .env.docker.bak-$stamp"
fi

if [ "$is_old_format" = '1' ]; then
  sh scripts/migrate-to-env-docker.sh "$old_compose"
else
  if [ ! -f .env.docker ]; then
    cp .env.docker.example .env.docker
    chmod 600 .env.docker
    echo '.env.docker 已从模板生成，请填写数据库密码、数据加密 Key、管理员初始密码后重新执行本脚本。' >&2
    exit 1
  fi
fi

# ---------------------------------------------------------------
# 5. 构建并启动
# ---------------------------------------------------------------
echo
echo '构建镜像（第一次可能需要几分钟）...'
docker compose --env-file .env.docker build --pull

echo '启动容器...'
docker compose --env-file .env.docker up -d

echo '等待容器就绪...'
attempt=1
while [ "$attempt" -le 60 ]; do
  running="$(docker compose --env-file .env.docker ps --status running --format '{{.Service}}' 2>/dev/null || true)"
  if printf '%s\n' "$running" | grep -q '^api$' && printf '%s\n' "$running" | grep -q '^web$'; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 2
done

docker compose --env-file .env.docker ps

echo
echo '=================================================='
echo ' 升级完成'
echo '=================================================='
echo '以后更新只要执行：'
echo '  cd '"$project_dir"
echo '  sh scripts/update-docker.sh'
echo
echo '如果页面没有变化，请在浏览器按 Ctrl+F5 强制刷新。'
