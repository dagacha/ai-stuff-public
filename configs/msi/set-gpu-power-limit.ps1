# Enforces the RTX 5090 power cap. Run by scheduled task "GPU-PowerLimit-475W" as SYSTEM
# at startup, at logon, and every 30 minutes (the cap has been observed to revert to the
# 575 W default without a reboot, so boot-only enforcement is not enough).
# Idempotent: only calls `nvidia-smi -pl` when the current limit differs; logs only changes/failures.
$target = 475
$smi = "C:\Windows\System32\nvidia-smi.exe"
$log = "C:\Users\<user>\gpu-pl.log"
$ts  = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$cur = ""
for ($i = 1; $i -le 12; $i++) {
    try { $cur = (& $smi --query-gpu=power.limit --format=csv,noheader,nounits).Trim() } catch { $cur = "query-failed" }
    if ($cur -match "^$target") {
        if ($i -gt 1) { Add-Content -Path $log -Value "$ts  OK on attempt $i (power.limit=$cur W)" }
        exit 0
    }
    if ($cur -ne "query-failed") { Add-Content -Path $log -Value "$ts  drift: power.limit=$cur W, re-applying $target W" }
    try { & $smi -pl $target | Out-Null } catch {}
    Start-Sleep -Seconds 2
    try { $cur = (& $smi --query-gpu=power.limit --format=csv,noheader,nounits).Trim() } catch { $cur = "query-failed" }
    if ($cur -match "^$target") {
        Add-Content -Path $log -Value "$ts  OK on attempt $i (power.limit=$cur W)"
        exit 0
    }
    Start-Sleep -Seconds 6
}
Add-Content -Path $log -Value "$ts  FAILED after 12 attempts (last power.limit=$cur)"
exit 1
