#!/bin/sh
# 更新已经部署好的系统。数据库数据不会丢失，.env.docker 不会被覆盖。
#
# 用法（在项目目录内执行，两种都行）：
#   sh scripts/update-docker.sh
#   ./scripts/update-docker.sh
#
# 更新方式自动判断：
#   - 目录里有 git 仓库：执行 git pull 拉取最新源码
#   - 没有 git：从 GitHub 下载最新源码并覆盖程序文件
# 两种方式都会保留 .env.docker、backups 等你自己生成的文件。
set -eu

REPO_OWNER='97xhb'
REPO_NAME='order-system'
REPO_BRANCH='main'

cd "$(dirname "$0")/.."
project_dir="$(pwd)"

if [ ! -f docker-compose.yml ]; then
  echo '当前目录找不到 docker-compose.yml，请在项目目录内执行本脚本。' >&2
  exit 1
fi

if [ ! -f .env.docker ]; then
  echo '未找到 .env.docker，无法更新。' >&2
  echo '首次部署请先执行：cp .env.docker.example .env.docker' >&2
  echo '然后填写数据库密码、数据加密 Key 和管理员初始密码。' >&2
  exit 1
fi

# 提前确认必填项已经填过，避免更新完才发现起不来。
if grep -q '^POSTGRES_PASSWORD=CHANGE_ME' .env.docker ||
  grep -q '^DATA_ENCRYPTION_KEY=CHANGE_ME' .env.docker; then
  echo '.env.docker 里仍是 CHANGE_ME 示例值，请先填写真实密码和密钥。' >&2
  exit 1
fi

echo '==> 备份当前 .env.docker'
cp .env.docker ".env.docker.bak-$(date +%Y%m%d-%H%M%S)"

echo '==> 获取最新源码'
need_download=0
if [ -d .git ] && command -v git >/dev/null 2>&1; then
  if git pull --ff-only; then
    echo '源码已通过 git 更新。'
  else
    echo 'git pull 未成功（可能有本地改动），改用下载方式覆盖程序文件。' >&2
    need_download=1
  fi
else
  echo '未检测到 git 仓库，将从 GitHub 下载最新源码。'
  need_download=1
fi

if [ "$need_download" = '1' ]; then
  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    echo '系统里没有 curl 或 wget，无法自动下载源码。' >&2
    echo '请手动上传新版程序文件后重新执行本脚本。' >&2
    exit 1
  fi

  tarball_url="https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${REPO_BRANCH}"
  tarball="$project_dir/.order-system-update.tar.gz"

  echo "下载：$tarball_url"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --connect-timeout 15 -o "$tarball" "$tarball_url"
  else
    wget -O "$tarball" "$tarball_url"
  fi

  if [ ! -s "$tarball" ]; then
    echo '下载失败，源码未更新。' >&2
    exit 1
  fi

  echo '解压并覆盖程序文件'
  tar -xzf "$tarball" -C "$project_dir" --strip-components=1
  rm -f "$tarball"
  echo '源码已更新，.env.docker 未改动。'
fi

echo '==> 构建镜像'
docker compose --env-file .env.docker build --pull

echo '==> 重启容器'
docker compose --env-file .env.docker up -d

echo '==> 等待容器就绪'
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
echo '更新完成。数据库迁移已在 API 容器启动时自动执行。'
echo '如果页面没有变化，请在浏览器按 Ctrl+F5 强制刷新。'
