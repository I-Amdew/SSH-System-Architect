#!/usr/bin/env bash
set -euo pipefail

mkdir -p /home/codex/.ssh
if [[ -f /opt/authorized_keys ]]; then
  cp /opt/authorized_keys /home/codex/.ssh/authorized_keys
fi

chown -R codex:codex /home/codex/.ssh
chmod 700 /home/codex/.ssh
chmod 600 /home/codex/.ssh/authorized_keys 2>/dev/null || true

if [[ -f /opt/bootstrap.sh ]]; then
  bash /opt/bootstrap.sh
fi

exec /usr/sbin/sshd -D -e
