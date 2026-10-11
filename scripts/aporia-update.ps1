<#
  Aporia self-update (local channel). Source of truth: C:\Tools\aporia (override with APORIA_SOURCE).
  Commands:
    status                     print update state (JSON)
    build [-Force]             build the source HEAD in the background (hidden, below-normal priority) and STAGE it.
                               Never restarts anything. This is the command agents call after committing.
    apply [-Restart -ByUser]   install the staged build. Without -Restart it only marks it to apply on next launch.
          [-WaitForExit PID]   (used by the app: wait for that Aporia process to quit, then swap and relaunch)
    rollback                   restore the previous build (kept on every apply)
    tick                       scheduled check: build if a new commit landed; apply only if Ali opted in to
                               "apply when idle" and no agent run is busy and the PC has been idle 10+ min.
  State/logs: %LOCALAPPDATA%\Aporia\updates\ (state.json, update.log, build.log, staged\, previous\, failed\)
#>
param(
  [Parameter(Position = 0)][string]$Cmd = 'status',
  [switch]$Force, [switch]$Restart, [switch]$ByUser, [switch]$Hidden,
  [int]$WaitForExit = 0, [int]$HealthSeconds = 30
)
$ErrorActionPreference = 'Stop'
$Src = if ($env:APORIA_SOURCE) { $env:APORIA_SOURCE } else { 'C:\Tools\aporia' }
$Root = Join-Path $env:LOCALAPPDATA 'Aporia\updates'
$Install = Join-Path $env:LOCALAPPDATA 'Programs\@opencodedesktop'
$StateF = Join-Path $Root 'state.json'
$ServiceF = Join-Path $env:USERPROFILE '.local\state\opencode\service.json'
New-Item -ItemType Directory -Force $Root | Out-Null

function Log($m) { $l = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Cmd] $m"; Add-Content -Path (Join-Path $Root 'update.log') -Value $l; Write-Output $m }
function Load-State { if (Test-Path $StateF) { try { return (Get-Content $StateF -Raw | ConvertFrom-Json) } catch {} }; return [pscustomobject]@{} }
function Save-State($s) { $s | ConvertTo-Json -Depth 8 | Set-Content -Path "$StateF.tmp" -Encoding UTF8; Move-Item "$StateF.tmp" $StateF -Force }
function Set-Prop($o, $k, $v) { if ($o.PSObject.Properties[$k]) { $o.$k = $v } else { $o | Add-Member -NotePropertyName $k -NotePropertyValue $v } }
function Mirror($from, $to) { robocopy $from $to /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP /XF 'Uninstall*.exe' | Out-Null; if ($LASTEXITCODE -ge 8) { throw "robocopy $from -> $to failed ($LASTEXITCODE)" } }
function Main-Aporia { Get-CimInstance Win32_Process -Filter "Name='Aporia.exe'" | Where-Object { $_.CommandLine -notmatch '--type=' } }
function Stop-Aporia {
  foreach ($p in @(Main-Aporia)) { try { (Get-Process -Id $p.ProcessId).CloseMainWindow() | Out-Null } catch {} }
  $t = Get-Date; while ((@(Main-Aporia).Count) -and ((Get-Date) - $t).TotalSeconds -lt 15) { Start-Sleep -Milliseconds 500 }
  foreach ($p in @(Main-Aporia)) { taskkill /PID $p.ProcessId /T /F 2>&1 | Out-Null }
  Get-CimInstance Win32_Process -Filter "Name='opencode-cli.exe'" | Where-Object { $_.ExecutablePath -like "$env:APPDATA\com.aporianous.desktop\*" -or $_.ExecutablePath -like "$Install\*" } | ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>&1 | Out-Null }
  Start-Sleep 2
}
function Start-Aporia { $w = if ($Hidden) { 'Hidden' } else { 'Normal' }; Start-Process (Join-Path $Install 'Aporia.exe') -WindowStyle $w }
function Test-Health([datetime]$since) {
  $t = Get-Date
  while (((Get-Date) - $t).TotalSeconds -lt $HealthSeconds) {
    if ((Test-Path $ServiceF) -and (Get-Item $ServiceF).LastWriteTime -gt $since) {
      try { $j = Get-Content $ServiceF -Raw | ConvertFrom-Json; $r = Invoke-WebRequest "$($j.url)/health" -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { return [math]::Round(((Get-Date) - $t).TotalSeconds, 1) } } catch {}
    }
    Start-Sleep -Milliseconds 500
  }
  return $null
}
function Busy { $f = Join-Path $Root 'busy.json'; if (-not (Test-Path $f)) { return 0 }; try { $b = Get-Content $f -Raw | ConvertFrom-Json; if (((Get-Date) - [datetime]$b.at).TotalMinutes -gt 3) { return 0 }; return [int]$b.busy } catch { return 0 } }
function Idle-Minutes {
  if (-not ('AporiaIdle' -as [type])) { Add-Type 'using System;using System.Runtime.InteropServices;public static class AporiaIdle{[StructLayout(LayoutKind.Sequential)]struct L{public uint s;public uint t;}[DllImport("user32.dll")]static extern bool GetLastInputInfo(ref L l);public static uint Ms(){L l=new L();l.s=8;GetLastInputInfo(ref l);return (uint)Environment.TickCount-l.t;}}' }
  return [AporiaIdle]::Ms() / 60000
}
function Head { Push-Location $Src; try { $c = (git rev-parse HEAD).Trim(); $s = (git log -1 --format=%s).Trim(); $b = (git branch --show-current).Trim(); return @{ commit = $c; subject = $s; branch = $b } } finally { Pop-Location } }

function Do-Build {
  $lock = Join-Path $Root 'build.lock'
  if (Test-Path $lock) { $old = Get-Content $lock -ErrorAction SilentlyContinue; if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) { Log "build already running (pid $old)"; return } }
  Set-Content $lock $PID
  try {
    (Get-Process -Id $PID).PriorityClass = 'BelowNormal'   # children (bun, electron-builder) inherit it
    $s = Load-State; $h = Head
    $have = @($s.installed.commit, $s.staged.commit)
    if (-not $Force -and $have -contains $h.commit) { Log "up to date ($($h.commit.Substring(0,10)))"; return }
    Log "building $($h.commit.Substring(0,10)) '$($h.subject)' on $($h.branch)"
    $exe = Join-Path $Src 'packages\desktop\dist\win-unpacked\Aporia.exe'; $t0 = Get-Date
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Src 'build-win6.ps1') *> (Join-Path $Root 'build.log')
    if (-not (Test-Path $exe) -or (Get-Item $exe).LastWriteTime -lt $t0) { Log "BUILD FAILED, see build.log"; Set-Prop $s 'lastBuild' @{ ok = $false; at = (Get-Date).ToString('o'); commit = $h.commit }; Save-State $s; exit 2 }
    Mirror (Split-Path $exe) (Join-Path $Root 'staged')
    Copy-Item $PSCommandPath (Join-Path $Root 'aporia-update.ps1') -Force
    Set-Prop $s 'staged' @{ commit = $h.commit; subject = $h.subject; branch = $h.branch; builtAt = (Get-Date).ToString('o'); minutes = [int]((Get-Date) - $t0).TotalMinutes }
    Set-Prop $s 'lastBuild' @{ ok = $true; at = (Get-Date).ToString('o'); commit = $h.commit }
    Save-State $s; Log "staged $($h.commit.Substring(0,10)). Ali sees 'Update ready, restart to apply'."
  } finally { Remove-Item $lock -Force -ErrorAction SilentlyContinue }
}

function Do-Apply {
  $s = Load-State; $staged = Join-Path $Root 'staged'
  if (-not (Test-Path (Join-Path $staged 'Aporia.exe'))) { Log 'nothing staged'; return }
  if ($WaitForExit) { $t = Get-Date; while ((Get-Process -Id $WaitForExit -ErrorAction SilentlyContinue) -and ((Get-Date) - $t).TotalSeconds -lt 60) { Start-Sleep -Milliseconds 300 }; Stop-Aporia }
  elseif (@(Main-Aporia).Count) {
    if (-not $Restart) { Set-Prop $s 'pendingApply' $true; Save-State $s; Log 'Aporia is running: will apply on next launch'; return }
    if (-not $ByUser) {
      if (-not $s.prefs.applyWhenIdle) { Log 'refusing to restart: needs Ali''s click (or opt-in to apply when idle)'; exit 3 }
      if ((Busy) -gt 0) { Log "not idle: $(Busy) agent run(s) busy, will retry"; exit 4 }
    }
    Stop-Aporia
  }
  Log "applying staged $($s.staged.commit)"
  Mirror $Install (Join-Path $Root 'previous')
  Set-Prop $s 'previous' @{ commit = $s.installed.commit; savedAt = (Get-Date).ToString('o') }
  Mirror $staged $Install
  $applying = Join-Path $Root 'applying'; if (Test-Path $applying) { Remove-Item $applying -Recurse -Force }; Move-Item $staged $applying
  $commit = $s.staged.commit; Set-Prop $s 'staged' $null; Set-Prop $s 'pendingApply' $false; Save-State $s
  $since = Get-Date; Start-Aporia; $sec = Test-Health $since
  if ($null -ne $sec) {
    Set-Prop $s 'installed' @{ commit = $commit; appliedAt = (Get-Date).ToString('o') }
    Set-Prop $s 'lastResult' @{ ok = $true; commit = $commit; loadSeconds = $sec; at = (Get-Date).ToString('o'); seen = $false }
    Save-State $s; Log "update OK: healthy in ${sec}s"; return
  }
  Log "health check FAILED within ${HealthSeconds}s: rolling back"
  Stop-Aporia; Mirror (Join-Path $Root 'previous') $Install
  $failed = Join-Path $Root 'failed'; if (Test-Path $failed) { Remove-Item $failed -Recurse -Force }; Move-Item $applying $failed
  $since = Get-Date; Start-Aporia; $sec = Test-Health $since
  Set-Prop $s 'lastResult' @{ ok = $false; rolledBack = $true; commit = $commit; restoredHealthy = ($null -ne $sec); loadSeconds = $sec; at = (Get-Date).ToString('o'); seen = $false }
  Save-State $s; Log "rolled back; previous build healthy=$($null -ne $sec)"; exit 5
}

function Do-Rollback {
  $prev = Join-Path $Root 'previous'; if (-not (Test-Path (Join-Path $prev 'Aporia.exe'))) { Log 'no previous build'; exit 1 }
  $s = Load-State; Stop-Aporia; Mirror $prev $Install; $since = Get-Date; Start-Aporia; $sec = Test-Health $since
  Set-Prop $s 'installed' @{ commit = $s.previous.commit; appliedAt = (Get-Date).ToString('o') }
  Set-Prop $s 'lastResult' @{ ok = ($null -ne $sec); rolledBack = $true; manual = $true; loadSeconds = $sec; at = (Get-Date).ToString('o'); seen = $false }
  Save-State $s; Log "manual rollback done, healthy=$($null -ne $sec)"
}

switch ($Cmd) {
  'status' { $s = Load-State; Set-Prop $s 'source' (Head); Set-Prop $s 'busy' (Busy); $s | ConvertTo-Json -Depth 8 }
  'build' { Do-Build }
  'apply' { Do-Apply }
  'rollback' { Do-Rollback }
  'tick' {
    Do-Build
    $s = Load-State
    if ($s.staged -and $s.prefs.applyWhenIdle -and (Busy) -eq 0 -and (Idle-Minutes) -ge 10) { $script:Restart = $true; Do-Apply }
  }
  default { Write-Output 'usage: aporia-update status|build [-Force]|apply [-Restart -ByUser]|rollback|tick' ; exit 1 }
}
