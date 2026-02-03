#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-opencode.test}"
DNS_ADDR="${DNS_ADDR:-127.0.0.1}"
DNS_PORT="${DNS_PORT:-53535}"
ENTRYPOINT="${ENTRYPOINT:-8080}"
COREDNS_BIN="${COREDNS_BIN:-coredns}"
TRAEFIK_BIN="${TRAEFIK_BIN:-traefik}"

CONFIG_PATH="${HOME}/.config/opencode/devenv.json"
RESOLVER_PATH="/etc/resolver/${DOMAIN}"

WRITE_CONFIG=false
WRITE_RESOLVER=false
FORCE_CONFIG=false

usage() {
  cat <<EOF
Usage: ./scripts/gateway-setup.sh [options]

Options:
  --write-config        Write ~/.config/opencode/devenv.json if missing
  --force-config        Overwrite ~/.config/opencode/devenv.json
  --write-resolver      Create /etc/resolver/<domain> (requires sudo)
  --domain <name>       Domain suffix (default: opencode.test)
  --dns-addr <ip>       CoreDNS listen address (default: 127.0.0.1)
  --dns-port <port>     CoreDNS listen port (default: 53535)
  --entrypoint <port>   Traefik entrypoint (default: 8080)
  --help                Show this help

Environment overrides: DOMAIN, DNS_ADDR, DNS_PORT, ENTRYPOINT, COREDNS_BIN, TRAEFIK_BIN
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --write-config) WRITE_CONFIG=true; shift ;;
    --force-config) FORCE_CONFIG=true; shift ;;
    --write-resolver) WRITE_RESOLVER=true; shift ;;
    --domain) DOMAIN="$2"; RESOLVER_PATH="/etc/resolver/${DOMAIN}"; shift 2 ;;
    --dns-addr) DNS_ADDR="$2"; shift 2 ;;
    --dns-port) DNS_PORT="$2"; shift 2 ;;
    --entrypoint) ENTRYPOINT="$2"; shift 2 ;;
    --help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

echo "Checking dependencies..."
if ! command -v "$COREDNS_BIN" >/dev/null 2>&1; then
  echo "  - Missing CoreDNS: install with 'brew install coredns' or set COREDNS_BIN"
else
  echo "  - CoreDNS: OK"
fi
if ! command -v "$TRAEFIK_BIN" >/dev/null 2>&1; then
  echo "  - Missing Traefik: install with 'brew install traefik' or set TRAEFIK_BIN"
else
  echo "  - Traefik: OK"
fi

echo "\nConfig file: ${CONFIG_PATH}"
if [[ -f "$CONFIG_PATH" && "$FORCE_CONFIG" != true ]]; then
  echo "  - Exists (no changes)."
else
  if [[ "$WRITE_CONFIG" == true || "$FORCE_CONFIG" == true ]]; then
    mkdir -p "$(dirname "$CONFIG_PATH")"
    cat >"$CONFIG_PATH" <<EOF
{
  "dns": {
    "enabled": true,
    "domain": "${DOMAIN}",
    "listenAddress": "${DNS_ADDR}",
    "listenPort": ${DNS_PORT},
    "resolverPath": "${RESOLVER_PATH}",
    "corednsBinary": "${COREDNS_BIN}"
  },
  "proxy": {
    "enabled": true,
    "entrypoint": ${ENTRYPOINT},
    "traefikBinary": "${TRAEFIK_BIN}"
  }
}
EOF
    echo "  - Wrote config."
  else
    echo "  - Missing. Run with --write-config to create it."
  fi
fi

echo "\nResolver file: ${RESOLVER_PATH}"
if [[ -f "$RESOLVER_PATH" ]]; then
  echo "  - Exists."
else
  if [[ "$WRITE_RESOLVER" == true ]]; then
    sudo mkdir -p /etc/resolver
    printf "nameserver %s\nport %s\n" "$DNS_ADDR" "$DNS_PORT" | sudo tee "$RESOLVER_PATH" >/dev/null
    echo "  - Created."
  else
    echo "  - Missing. Run with --write-resolver to create it."
    echo "    sudo mkdir -p /etc/resolver"
    echo "    printf \"nameserver ${DNS_ADDR}\\nport ${DNS_PORT}\\n\" | sudo tee ${RESOLVER_PATH}"
  fi
fi

echo "\nNext steps:"
echo "  - Run: devenv_manage: scope=\"dns\", action=\"start\""
echo "  - Run: devenv_manage: scope=\"proxy\", action=\"start\""
echo "  - Spawn a dev server with devenv_spawn and visit http://<project>.${DOMAIN}:${ENTRYPOINT}"
