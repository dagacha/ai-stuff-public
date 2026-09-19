#!/bin/bash
# run on the HEAD after all three nodes applied netplan; exits non-zero (with a count) if any check fails.
# Covers every link in both directions plus ssh over the ring to both peers; prints the check count on success.
W_TS=${W_TS:-100.<tailscale-ip-6>}   # worker over Tailscale (its CX7 addresses are what we are testing)
SSH="ssh -o ConnectTimeout=5 -o BatchMode=yes"
fails=0; checks=0
p(){ checks=$((checks+1)); printf '%-34s ' "$1 -> $2"; if ping -c1 -W2 -I "$3" "$2" >/dev/null 2>&1; then echo OK; else echo FAIL; fails=$((fails+1)); fi; }
# remote_pings HOST LABEL ADDR... : ping each ADDR from HOST, print one line per address, return the failure count
remote_pings(){ local h=$1 l=$2; shift 2; $SSH "$h" "f=0; for a in $*; do if ping -c1 -W2 \$a >/dev/null 2>&1; then echo \"$l -> \$a OK\"; else echo \"$l -> \$a FAIL\"; f=\$((f+1)); fi; done; exit \$f"; }
echo "== head links"; ibdev2netdev
p "head Port0"  10.10.0.2 10.10.0.1;  p "head Port0 (2nd iface)" 10.10.1.2 10.10.1.1     # -> worker Port1
p "head Port1"  10.10.2.2 10.10.2.1;  p "head Port1 (2nd iface)" 10.10.3.2 10.10.3.1     # -> indie Port0
echo "== worker: Port1 -> head, Port0 -> indie (via $W_TS)"
remote_pings "$W_TS" worker 10.10.0.1 10.10.1.1 10.10.4.2 10.10.5.2; rc=$?; checks=$((checks+4))
if [ "$rc" -ge 255 ]; then echo "worker ssh ($W_TS) FAIL"; fails=$((fails+1)); else fails=$((fails+rc)); fi
echo "== indie: Port0 -> head, Port1 -> worker (via ring 10.10.2.2)"
remote_pings 10.10.2.2 indie 10.10.2.1 10.10.3.1 10.10.4.1 10.10.5.1; rc=$?; checks=$((checks+4))
if [ "$rc" -ge 255 ]; then echo "indie ssh (10.10.2.2) FAIL"; fails=$((fails+1)); else fails=$((fails+rc)); fi
echo "== ssh over the ring"; checks=$((checks+2))
if ! $SSH 10.10.0.2 hostname; then echo "ssh 10.10.0.2 (worker, serving link) FAIL"; fails=$((fails+1)); fi
if ! $SSH 10.10.2.2 hostname; then echo "ssh 10.10.2.2 (indie, head Port1) FAIL"; fails=$((fails+1)); fi
if [ "$fails" -gt 0 ]; then echo "verify-ring: $fails of $checks check(s) FAILED"; exit 1; fi
echo "verify-ring: all $checks checks OK"
