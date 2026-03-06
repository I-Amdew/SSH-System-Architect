#!/usr/bin/env bash
set -euo pipefail

docker compose -f lab/ssh_cluster/docker-compose.yml down --remove-orphans "$@"
