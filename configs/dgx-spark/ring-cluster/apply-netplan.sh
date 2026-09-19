#!/bin/bash
# usage: sudo bash apply-netplan.sh nodeN-40-cx7.yaml   (run on that node, over Tailscale/Wi-Fi, not the CX7 address)
# Backs up /etc/netplan to /root/netplan-pre-ring (refuses to overwrite it; FORCE_BACKUP=1 writes a
# timestamped dir instead), moves the old 40-cx7-cluster.yaml and any existing 40-cx7.yaml aside, installs
# the new file and validates it with `netplan generate` BEFORE `netplan apply`; on a validation failure both
# moved files are put back and nothing is applied.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
SRC="$(dirname "$0")/${1:?usage: apply-netplan.sh nodeN-40-cx7.yaml}"; [ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }
B=/root/netplan-pre-ring
if [ -e "$B" ]; then
  if [ "${FORCE_BACKUP:-0}" = 1 ]; then B=/root/netplan-pre-ring.$(date +%Y%m%d-%H%M%S); echo "backup exists, using $B"
  else echo "refusing: $B already exists (rerun? set FORCE_BACKUP=1 for a timestamped dir)"; exit 1; fi
fi
mkdir -p "$B" && cp -a /etc/netplan/. "$B"/
OLD=/etc/netplan/40-cx7-cluster.yaml; NEW=/etc/netplan/40-cx7.yaml   # OLD = 172.31.100.x point-to-point config (absent on the indie)
[ -e "$OLD" ] && mv "$OLD" "$B/40-cx7-cluster.yaml.moved"
[ -e "$NEW" ] && mv "$NEW" "$B/40-cx7.yaml.replaced"      # re-run / indie case: the file being replaced
install -m 600 "$SRC" "$NEW"
if ! netplan generate; then
  echo "netplan generate FAILED — restoring previous config, nothing applied"
  rm -f "$NEW"
  [ -e "$B/40-cx7-cluster.yaml.moved" ] && mv "$B/40-cx7-cluster.yaml.moved" "$OLD"
  [ -e "$B/40-cx7.yaml.replaced" ] && mv "$B/40-cx7.yaml.replaced" "$NEW"
  netplan generate || true
  exit 1
fi
netplan apply
sleep 3; ip -br addr | grep -E 'enp1|enP2' || true; ibdev2netdev   # no CX7 netdevs at all = the hotplug gotcha; ibdev2netdev is the diagnostic
