#!/usr/bin/env bash
# Proxmox VE Unprivileged Debian 12 LXC Installer for eshnav (אשנב / הבית שלנו)
set -euo pipefail

APP_USER="eshnav"
APP_DIR="/opt/eshnav"
DATA_DIR="/var/lib/eshnav"
CONF_DIR="/etc/eshnav"
ENV_FILE="${CONF_DIR}/eshnav.env"
SERVICE_FILE="/etc/systemd/system/eshnav.service"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Error: run install-lxc.sh as root inside the Debian 12 LXC container." >&2
  exit 1
fi

echo "==> [1/7] Configuring Asia/Jerusalem timezone & base packages..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  ca-certificates curl gnupg openssl tzdata python3 make g++ rsync >/dev/null

ln -snf /usr/share/zoneinfo/Asia/Jerusalem /etc/localtime
echo "Asia/Jerusalem" >/etc/timezone

echo "==> [2/7] Ensuring Node.js 22 LTS..."
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    >/etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null
fi

echo "==> [3/7] Creating system user & directories..."
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "${DATA_DIR}" --no-create-home --shell /usr/sbin/nologin "${APP_USER}"
fi

install -d -m 0750 -o "${APP_USER}" -g "${APP_USER}" "${DATA_DIR}"
install -d -m 0750 -o root -g "${APP_USER}" "${CONF_DIR}"
install -d -m 0755 "${APP_DIR}"

echo "==> [4/7] Syncing application source & building production bundle..."
if [[ "${SRC_DIR}" != "${APP_DIR}" ]]; then
  rsync -a --delete \
    --exclude node_modules \
    --exclude dist \
    --exclude data \
    --exclude .git \
    --exclude test-results \
    --exclude playwright-report \
    "${SRC_DIR}/" "${APP_DIR}/"
fi

pushd "${APP_DIR}" >/dev/null
npm ci
npm run build
npm prune --omit=dev
popd >/dev/null
chown -R root:root "${APP_DIR}"

echo "==> [5/7] Generating ${ENV_FILE} (preserving existing secrets if present)..."
if [[ ! -f "${ENV_FILE}" ]]; then
  SECRET_HEX="$(openssl rand -hex 32)"
  cat >"${ENV_FILE}" <<EOF
NODE_ENV=production
TZ=Asia/Jerusalem
HOST=0.0.0.0
PORT=3000
DB_PATH=${DATA_DIR}/eshnav.db
SESSION_SECRET=${SECRET_HEX}
EOF
  chown root:"${APP_USER}" "${ENV_FILE}"
  chmod 0640 "${ENV_FILE}"
fi

echo "==> [6/7] Initializing SQLite WAL database..."
if [[ ! -f "${DATA_DIR}/eshnav.db" ]]; then
  su -s /bin/bash "${APP_USER}" -c "cd '${APP_DIR}' && DB_PATH='${DATA_DIR}/eshnav.db' node -e \"import('./packages/server/dist/db/connection.js').then(async ({openDatabase})=>{const {seedFamilyData}=await import('./packages/server/dist/db/seed-data.js');const db=openDatabase('${DATA_DIR}/eshnav.db');seedFamilyData(db);db['\\\$client'].close();})\""
fi

echo "==> [7/7] Enabling & starting eshnav.service..."
install -m 0644 "${APP_DIR}/deploy/eshnav.service" "${SERVICE_FILE}"
systemctl daemon-reload
systemctl enable --now eshnav.service

for _ in {1..15}; do
  if curl -fsS "http://127.0.0.1:3000/api/v1/board" >/dev/null 2>&1; then
    echo "eshnav is up and listening on port 3000 (Default Parent PIN: 1234)."
    exit 0
  fi
  sleep 1
done

echo "Warning: eshnav service started, check logs via: journalctl -u eshnav -n 50" >&2
exit 1
