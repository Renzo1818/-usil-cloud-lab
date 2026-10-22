#!/usr/bin/env bash
# Reparación específica para Codespaces con Docker nft y FORWARD legacy DROP.
set -euo pipefail
cd "$(dirname "$0")/.."
if ! sudo iptables-legacy -S FORWARD | head -1 | grep -qx -- '-P FORWARD DROP'; then
  echo 'No se detectó el bloqueo legacy conocido; no se modificaron reglas.'
  exit 0
fi
app_id=$(docker compose ps -aq app)
if [ -z "$app_id" ]; then
  echo 'Primero crea los servicios con docker compose up -d.' >&2
  exit 1
fi
network_ids=$(docker inspect "$app_id" --format '{{range .NetworkSettings.Networks}}{{.NetworkID}} {{end}}')
for network_id in $network_ids; do
  driver=$(docker network inspect "$network_id" --format '{{.Driver}}')
  [ "$driver" = bridge ] || continue
  bridge_name=$(docker network inspect "$network_id" --format '{{index .Options "com.docker.network.bridge.name"}}')
  if [ -z "$bridge_name" ]; then bridge_name="br-${network_id:0:12}"; fi
  if ! sudo iptables-legacy -C DOCKER-USER -i "$bridge_name" -o "$bridge_name" -j ACCEPT 2>/dev/null; then
    sudo iptables-legacy -I DOCKER-USER 1 -i "$bridge_name" -o "$bridge_name" -j ACCEPT
  fi
  echo "Permitido tráfico dentro de $bridge_name; sin cambiar puertos ni política global."
done
