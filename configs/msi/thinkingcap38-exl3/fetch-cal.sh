#!/bin/bash
set -e
M=/home/<user>/qwen38-exl3-venv/lib/python3.12/site-packages/exllamav3/conversion/standard_cal_data
B=https://raw.githubusercontent.com/MiaAI-Lab/exllamav3/63b32f001d7b2cfed3b3e3aaf25f534ba53cc7ed/exllamav3/conversion/standard_cal_data
for f in c4 code multilingual technical tiny wiki; do curl -sfL -m 60 -o "$M/$f.utf8" "$B/$f.utf8"; done
ls -la $M/*.utf8 | awk '{print $5, $9}'
python3 - <<'PY'
import os
M="/home/<user>/qwen38-exl3-venv/lib/python3.12/site-packages/exllamav3/conversion/standard_cal_data"
exp={"c4":1338229,"code":1357117,"multilingual":293500,"technical":350054,"tiny":261689,"wiki":2093275}
bad=[k for k,v in exp.items() if os.path.getsize(f"{M}/{k}.utf8")!=v]
print("size mismatch:",bad) if bad else print("all 6 calibration files verified")
raise SystemExit(1 if bad else 0)
PY
