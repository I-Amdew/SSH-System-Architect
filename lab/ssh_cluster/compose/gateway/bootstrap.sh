#!/usr/bin/env bash
set -euo pipefail

rm -rf /srv/ssh-system-architect
cp -R /workspace /srv/ssh-system-architect
chown -R codex:codex /srv/ssh-system-architect
