$ErrorActionPreference = "Stop"
docker compose -f lab/ssh_cluster/docker-compose.yml down --remove-orphans $args
