#!/usr/bin/env bash
set -euo pipefail

docker compose -f lab/ssh_cluster/docker-compose.yml up --build -d "$@"
