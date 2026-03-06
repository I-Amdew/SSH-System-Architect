$ErrorActionPreference = "Stop"
docker compose -f lab/ssh_cluster/docker-compose.yml up --build -d $args
