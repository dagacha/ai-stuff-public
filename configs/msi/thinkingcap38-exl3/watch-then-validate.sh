#!/bin/bash
# Wait for the conversion unit to finish; if it succeeded, launch validation (which stops prod again and restores it at the end).
LOG=/home/<user>/runs/tc38-watch-validate.log; exec >>"$LOG" 2>&1
echo "=== $(date -Is) watcher start"
while systemctl --user is-active tc38-convert.service >/dev/null; do sleep 20; done
echo "=== $(date -Is) convert unit finished"
grep -q 'All done' /home/<user>/runs/tc38-convert.log || { echo "converter did not report All done; not validating"; tail -20 /home/<user>/runs/tc38-convert.log; exit 1; }
[ -f /home/<user>/models/bottlecapai/ThinkingCap-Qwen3.8-27B-EXL3-5.5bpw/config.json ] || { echo "no output config.json"; exit 1; }
# let the converter's prod restore settle so the two switch-lane calls don't fight
sleep 120
systemctl --user reset-failed tc38-validate.service 2>/dev/null
systemd-run --user --unit tc38-validate --collect bash /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/thinkingcap38-exl3/validate-run.sh
echo "=== $(date -Is) validation launched"
