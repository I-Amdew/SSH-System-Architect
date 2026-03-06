#!/usr/bin/env bash
set -euo pipefail

rm -rf /srv/ssh-system-architect
cp -R /workspace /srv/ssh-system-architect
printf '\n// host_b lab drift marker\n' >> /srv/ssh-system-architect/examples/demo_sharded_snake/services/snake_shard/src/main.ts
chown -R codex:codex /srv/ssh-system-architect
