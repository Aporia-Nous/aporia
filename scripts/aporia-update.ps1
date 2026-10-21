<#
  Aporia self-update (local channel). Source of truth: C:\Tools\aporia (override with APORIA_SOURCE).
  Commands:
    status                     print update state (JSON)
    build [-Force]             build the source HEAD in the background (hidden, below-normal priority) and STAGE it.
                               Never restarts anything. This is the command agents call after committing.
    apply [-Restart -ByUser]   install the staged build. Without -Restart it only marks it to apply on next launch.
          [-WaitForExit PID]   (used by the app: wait for that Aporia process to quit, then swap and relaunch)
    rollback                   restore the previous build (kept on every apply)
    verify [-Dir PATH] [-Expect COMMIT]
                               check a folder's CLI identity without building, installing or restarting: exit 0 only
                               if the CLI is stamped, was not built from a dirty tree, and (when -Expect is given)
                               reports that commit. Defaults to the installed app and its recorded commit.
    tick                       scheduled check: build if a new commit landed; apply only if Ali opted in to
                               "apply when idle" and no agent run is busy and the PC has been idle 10+ min.
  State/logs: %LOCALAPPDATA%\Aporia\updates\ (state.json, update.log, build.log, staged\, previous\, failed\)
#>
param(
  [Parameter(Position = 0)][string]$Cmd = 'status',
  [switch]$Force, [switch]$Restart, [switch]$ByUser, [switch]$Hidden,
  [int]$WaitForExit = 0, [int]$HealthSeconds = 30,
  [Alias('Dir')][string]$VerifyDir, [string]$Expect
)
$ErrorActionPreference = 'Continue'  # native tools (taskkill, bun) write to stderr; real failures throw explicitly
$Src = if ($env:APORIA_SOURCE) { $env:APORIA_SOURCE } else { 'C:\Tools\aporia' }
$Root = Join-Path $env:LOCALAPPDATA 'Aporia\updates'
# Must match the folder the NSIS installer uses (resources/windows/installer.nsh: $LOCALAPPDATA\Programs\${PRODUCT_NAME}).
# A stale value here mirrors every staged build into a folder that is NOT the installed app, fails the health check and
# rolls back - i.e. updates silently never work. It was '@opencodedesktop' (the npm package name), which is not it.
$Install = Join-Path $env:LOCALAPPDATA 'Programs\Aporetic'
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
      try { $j = Get-Content $ServiceF -Raw | ConvertFrom-Json; $sp = Get-CimInstance Win32_Process -Filter "ProcessId=$($j.pid)"; $pp = if ($sp) { Get-CimInstance Win32_Process -Filter "ProcessId=$($sp.ParentProcessId)" }; if (-not $pp -or $pp.ExecutablePath -notlike "$Install\*") { throw "service.json not from this Aporia" }; $r = Invoke-WebRequest "$($j.url)/health" -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { return [math]::Round(((Get-Date) - $t).TotalSeconds, 1) } } catch {}
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

# Every mutating command is an OPERATION with an id, recorded in state. A reader must be able to tell "the operation I
# asked for succeeded" from "some earlier operation succeeded". Historical ok=true must never certify a new attempt -
# that was a real false green: a no-op build left lastBuild.ok=true from three days earlier and read as healthy.
function New-Operation($name) {
  $id = "{0}-{1}-{2}" -f (Get-Date -Format 'yyyyMMddHHmmss'), $name, ([guid]::NewGuid().ToString('N').Substring(0, 8))
  $script:opId = $id
  return $id
}

# Read a CLI's build provenance by EXECUTING it. Never by reading a json file beside it: the artifact and the identity
# it claims must not be separable, or a stale binary can be shipped under a fresh label. Returns $null if the binary
# cannot be run at all; returns an object with stamped=$false if it runs but carries no stamp.
function Get-CliBuildInfo($exe) {
  if (-not (Test-Path $exe)) { return $null }
  $lines = $null
  try { $lines = @(& $exe '--build-info' 2>$null) } catch { return $null }
  if (-not $lines -or $lines.Count -eq 0) { return $null }
  # Take the first line that parses as a JSON object carrying 'stamped'. Reading only the first line would break the
  # moment the binary emits a warning line before the stamp; matching on the 'stamped' property keeps the stamp
  # authoritative without accepting arbitrary output.
  foreach ($l in $lines) {
    $t = "$l".Trim()
    if (-not $t.StartsWith('{')) { continue }
    $o = $null
    try { $o = $t | ConvertFrom-Json } catch { continue }
    if ($o -and $null -ne $o.PSObject.Properties['stamped']) { return $o }
  }
  # A binary that predates stamping prints help (an unknown flag is not an error to it), so no JSON line means
  # "runs, but has no stamp" - which is a refusal, not a crash. Report it as such instead of as an execution failure.
  $first = ("$($lines[0])").Trim()
  $sample = if ($first.Length -gt 40) { $first.Substring(0, 40) } else { $first }
  return [pscustomobject]@{ stamped = $false; note = "binary ran but printed no build stamp (first line: $sample)" }
}

function Do-Build {
  $op = New-Operation 'build'
  $lock = Join-Path $Root 'build.lock'
  if (Test-Path $lock) { $old = Get-Content $lock -ErrorAction SilentlyContinue; if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) { Log "[$op] build already running (pid $old) - NO BUILD PERFORMED"; exit 6 } }
  Set-Content $lock $PID
  try {
    (Get-Process -Id $PID).PriorityClass = 'BelowNormal'   # children (bun, electron-builder) inherit it
    $s = Load-State; $h = Head
    Log "[$op] entered build: pid=$PID forced=$Force source=$($h.commit.Substring(0,10)) branch=$($h.branch)"
    $have = @($s.installed.commit, $s.staged.commit)
    if (-not $Force -and $have -contains $h.commit) { Log "[$op] up to date ($($h.commit.Substring(0,10))) - NO BUILD PERFORMED"; return }
    Log "building $($h.commit.Substring(0,10)) '$($h.subject)' on $($h.branch)"
    $exe = Join-Path $Src 'packages\desktop\dist\win-unpacked\Aporia.exe'; $t0 = Get-Date
    $bl = Join-Path $Root 'build.log'; $bs = Join-Path $Src 'build-win6.ps1'
    cmd /c "powershell -NoProfile -ExecutionPolicy Bypass -File `"$bs`" > `"$bl`" 2>&1"
    $bc = $LASTEXITCODE
    Log "[$op] build-win6.ps1 exit=$bc"
    if (-not (Test-Path $exe) -or (Get-Item $exe).LastWriteTime -lt $t0) { Log "[$op] BUILD FAILED (exe missing or not rebuilt), see build.log"; Set-Prop $s 'lastBuild' @{ ok = $false; at = (Get-Date).ToString('o'); commit = $h.commit; operationId = $op; reason = 'packaged exe missing or not rebuilt'; exit = $bc }; Save-State $s; exit 2 }
    # --- the build invariant, part 1. The CLI the packaging step just produced must certify, in its own voice, that it
    # came from THIS source tree. Checked on the packaged build BEFORE anything is mirrored into staged\, so a refused
    # build leaves staged\ untouched rather than replacing a good artifact with one nobody can certify.
    $builtCli = Join-Path (Split-Path $exe) 'resources\opencode-cli.exe'
    $cli = Get-CliBuildInfo $builtCli
    $why = $null
    if (-not (Test-Path $builtCli)) { $why = "packaged app has no CLI at resources\opencode-cli.exe" }
    elseif (-not $cli) { $why = 'could not execute the packaged CLI to read its build stamp' }
    elseif (-not $cli.stamped) { $why = "packaged CLI carries no build stamp: $($cli.note)" }
    elseif ($cli.commit -ne $h.commit) { $why = "packaged CLI reports commit $($cli.commit) but source HEAD is $($h.commit)" }
    elseif ($cli.dirty) { $why = "packaged CLI was built from a DIRTY tree, so it is not equivalent to commit $($h.commit)" }
    if ($why) {
      Log "[$op] BUILD INVARIANT FAILED: $why"
      Log "[$op] refusing to stage. staged\ was not touched; the installed build is untouched."
      $fail = @{ ok = $false; at = (Get-Date).ToString('o'); commit = $h.commit; operationId = $op; reason = "build invariant: $why" }
      if ($cli) { $fail.cliBuild = @{ commit = $cli.commit; dirty = $cli.dirty; buildId = $cli.buildId; builtAt = $cli.builtAt } }
      Set-Prop $s 'lastBuild' $fail
      Save-State $s; exit 3
    }
    $cliSha = (Get-FileHash $builtCli -Algorithm SHA256).Hash
    Log "[$op] build invariant OK: packaged CLI says commit=$($cli.commit.Substring(0,10)) dirty=$($cli.dirty) buildId=$($cli.buildId) builtAt=$($cli.builtAt) sha256=$($cliSha.Substring(0,16))"
    Mirror (Split-Path $exe) (Join-Path $Root 'staged')
    # Refresh the deployed copy only when we were run from somewhere else (e.g. $Src\scripts after a git pull).
    # Copying the deployed copy onto itself throws a non-terminating "cannot overwrite the item with itself" error,
    # which made every otherwise-good build log look broken.
    $deployedSelf = Join-Path $Root 'aporia-update.ps1'
    if ((Resolve-Path $PSCommandPath).Path -ne (Resolve-Path $deployedSelf -ErrorAction SilentlyContinue).Path) {
      Copy-Item $PSCommandPath $deployedSelf -Force
    }
    # Assert the staged artifact is actually complete before claiming success: a stage that "succeeds" with no CLI is
    # indistinguishable from a good one to every later reader.
    $stagedAsar = Join-Path $Root 'staged\resources\app.asar'
    $stagedCli = Join-Path $Root 'staged\resources\opencode-cli.exe'
    if (-not (Test-Path $stagedAsar) -or -not (Test-Path $stagedCli)) {
      Log "[$op] STAGE FAILED: incomplete staged app (asar=$(Test-Path $stagedAsar) cli=$(Test-Path $stagedCli))"
      Set-Prop $s 'lastBuild' @{ ok = $false; at = (Get-Date).ToString('o'); commit = $h.commit; operationId = $op; reason = 'staged app incomplete' }
      Save-State $s; exit 2
    }
    # --- the build invariant, part 2: the copy must be the same bytes we certified, so the thing we handed to apply is
    # the thing we verified. A copy step is where "verified the source, shipped the sibling" bugs live.
    $stagedSha = (Get-FileHash $stagedCli -Algorithm SHA256).Hash
    if ($stagedSha -ne $cliSha) {
      Log "[$op] BUILD INVARIANT FAILED: staged CLI sha256 $($stagedSha.Substring(0,16)) is not the certified artifact $($cliSha.Substring(0,16))"
      Log "[$op] refusing to stage."
      Set-Prop $s 'lastBuild' @{ ok = $false; at = (Get-Date).ToString('o'); commit = $h.commit; operationId = $op; reason = 'build invariant: staged CLI differs from the certified packaged CLI' }
      Save-State $s; exit 3
    }
    $cliInfo = Get-Item $stagedCli
    Log "[$op] staged CLI built=$($cliInfo.LastWriteTime) bytes=$($cliInfo.Length) sha256 verified"
    $stagedRec = @{
      commit = $h.commit; subject = $h.subject; branch = $h.branch; builtAt = (Get-Date).ToString('o')
      minutes = [int]((Get-Date) - $t0).TotalMinutes; operationId = $op; cliBuilt = $cliInfo.LastWriteTime.ToString('o')
      cliBuild = @{ commit = $cli.commit; dirty = $cli.dirty; buildId = $cli.buildId; builtAt = $cli.builtAt; sha256 = $cliSha }
    }
    Set-Prop $s 'staged' $stagedRec
    Set-Prop $s 'lastBuild' @{ ok = $true; at = (Get-Date).ToString('o'); commit = $h.commit; operationId = $op; cliBuild = $stagedRec.cliBuild }
    Save-State $s; Log "[$op] staged $($h.commit.Substring(0,10)). Ali sees 'Update ready, restart to apply'."
  } finally { Remove-Item $lock -Force -ErrorAction SilentlyContinue }
}

function Do-Apply {
  $op = New-Operation 'apply'
  $s = Load-State; $staged = Join-Path $Root 'staged'
  if (-not (Test-Path (Join-Path $staged 'Aporia.exe'))) {
    # No staged artifact means no operation happened. Recording ok:false with this operation's id is what stops an
    # old lastResult.ok=true from being read as "the apply I just asked for was healthy".
    Set-Prop $s 'lastResult' @{ ok = $false; operationId = $op; at = (Get-Date).ToString('o'); reason = 'nothing staged - no operation performed' }
    Save-State $s; Log "[$op] nothing staged - no operation performed"; exit 1
  }
  $stagedCommit = $s.staged.commit
  $stagedCliBuild = $s.staged.cliBuild
  $stagedCliSha = if ($stagedCliBuild) { $stagedCliBuild.sha256 } else { $null }
  # The staged artifact must still match the source tree. If commits landed after staging, this build is no longer
  # equivalent to HEAD, so applying it would install something no commit describes - refuse, and say what to do.
  if ($stagedCommit -and $stagedCommit -ne (Head).commit) {
    $why = "staged build is $($stagedCommit.Substring(0,10)) but source HEAD is now $((Head).commit.Substring(0,10))"
    Log "[$op] BUILD INVARIANT FAILED: $why - refusing to apply. Run build to re-stage from HEAD."
    Set-Prop $s 'lastResult' @{ ok = $false; operationId = $op; at = (Get-Date).ToString('o'); stagedCommit = $stagedCommit; reason = "build invariant: $why"; seen = $false }
    Save-State $s; exit 7
  }
  if (-not $stagedCliBuild) {
    # No provenance record means nothing was ever certified about the binary in staged\. Applying it would be exactly
    # the stale-CLI failure this invariant exists to prevent, so refuse rather than fall back to trusting the folder.
    Log "[$op] BUILD INVARIANT FAILED: staged build has no CLI provenance record - refusing to apply. Run build to re-stage."
    Set-Prop $s 'lastResult' @{ ok = $false; operationId = $op; at = (Get-Date).ToString('o'); reason = 'build invariant: staged build has no CLI provenance record'; seen = $false }
    Save-State $s; exit 7
  }
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
  # --- build invariant, after install: the installed CLI must BE the staged artifact, in its own words and its own bytes ---
  $instCli = Join-Path $Install 'resources\opencode-cli.exe'
  $inst = Get-CliBuildInfo $instCli
  $invFail = $null
  if (-not $inst) { $invFail = 'could not execute the installed CLI to read its build stamp' }
  elseif (-not $inst.stamped) { $invFail = 'installed CLI carries no build stamp' }
  elseif ($inst.commit -ne $stagedCliBuild.commit) { $invFail = "installed CLI reports commit $($inst.commit), staged was $($stagedCliBuild.commit)" }
  elseif ($inst.commit -ne $commit) { $invFail = "installed CLI reports commit $($inst.commit), expected $commit" }
  elseif ($inst.dirty) { $invFail = 'installed CLI was built from a dirty tree' }
  elseif ($stagedCliSha) {
    $instSha = (Get-FileHash $instCli -Algorithm SHA256).Hash
    if ($instSha -ne $stagedCliSha) { $invFail = "installed CLI sha256 $($instSha.Substring(0,16)) is not the staged artifact $($stagedCliSha.Substring(0,16))" }
  }
  if ($invFail) { Log "[$op] BUILD INVARIANT FAILED after install: $invFail" }
  $since = Get-Date; Start-Aporia; $sec = Test-Health $since
  if ($null -ne $sec -and -not $invFail) {
    Set-Prop $s 'installed' @{ commit = $commit; appliedAt = (Get-Date).ToString('o'); operationId = $op; cliBuild = @{ commit = $inst.commit; dirty = $inst.dirty; buildId = $inst.buildId; builtAt = $inst.builtAt; sha256 = $stagedCliSha } }
    Set-Prop $s 'lastResult' @{ ok = $true; commit = $commit; stagedCommit = $stagedCommit; loadSeconds = $sec; at = (Get-Date).ToString('o'); seen = $false; operationId = $op; cliCommit = $inst.commit }
    Save-State $s; Log "update OK: healthy in ${sec}s; installed CLI identity verified ($($inst.commit.Substring(0,10)))"; return
  }
  if ($invFail) { Log "[$op] rolling back: the installed CLI is not what was staged" }
  else { Log "health check FAILED within ${HealthSeconds}s: rolling back" }
  Stop-Aporia; Mirror (Join-Path $Root 'previous') $Install
  $failed = Join-Path $Root 'failed'; if (Test-Path $failed) { Remove-Item $failed -Recurse -Force }; Move-Item $applying $failed
  $since = Get-Date; Start-Aporia; $sec = Test-Health $since
  $rollReason = if ($invFail) { "build invariant: $invFail" } else { 'health check failed' }
  Set-Prop $s 'lastResult' @{ ok = $false; rolledBack = $true; commit = $commit; stagedCommit = $stagedCommit; restoredHealthy = ($null -ne $sec); loadSeconds = $sec; at = (Get-Date).ToString('o'); seen = $false; operationId = $op; reason = $rollReason }
  Save-State $s; Log "rolled back; previous build healthy=$($null -ne $sec); reason: $rollReason"; exit 5
}

function Do-Rollback {
  $prev = Join-Path $Root 'previous'; if (-not (Test-Path (Join-Path $prev 'Aporia.exe'))) { Log 'no previous build'; exit 1 }
  $s = Load-State; Stop-Aporia; Mirror $prev $Install; $since = Get-Date; Start-Aporia; $sec = Test-Health $since
  Set-Prop $s 'installed' @{ commit = $s.previous.commit; appliedAt = (Get-Date).ToString('o') }
  Set-Prop $s 'lastResult' @{ ok = ($null -ne $sec); rolledBack = $true; manual = $true; loadSeconds = $sec; at = (Get-Date).ToString('o'); seen = $false }
  Save-State $s; Log "manual rollback done, healthy=$($null -ne $sec)"
}

function Do-Verify {
  # Answers "is the app in this folder actually the build we think it is?" without building, installing or restarting
  # anything. It is the same Get-CliBuildInfo check the build and apply gates use, so it can be run against a staged
  # folder, an installed app, or an artifact someone handed over - which is the only way to exercise the mismatch case
  # without waiting on a build.
  $s = Load-State
  $dir = if ($VerifyDir) { $VerifyDir } else { $Install }
  $expect = if ($Expect) { $Expect } elseif ($dir -eq $Install) { $s.installed.commit } else { $null }
  $exe = Join-Path $dir 'resources\opencode-cli.exe'
  $info = Get-CliBuildInfo $exe
  $reasons = @()
  if (-not (Test-Path $exe)) { $reasons += "no CLI at $exe" }
  elseif (-not $info) { $reasons += 'could not execute the CLI to read its build stamp' }
  else {
    if (-not $info.stamped) { $reasons += "CLI carries no build stamp: $($info.note)" }
    if ($info.dirty -eq $true) { $reasons += "CLI was built from a dirty tree: $($info.dirtySample)" }
    if ($expect -and $info.stamped -and $info.commit -ne $expect) {
      $reasons += "CLI reports commit $($info.commit) but $expect was expected"
    }
  }
  $sha = $null
  if (Test-Path $exe) { $sha = (Get-FileHash $exe -Algorithm SHA256).Hash }
  [ordered]@{ ok = ($reasons.Count -eq 0); dir = $dir; expected = $expect; sha256 = $sha; cli = $info; reasons = $reasons } | ConvertTo-Json -Depth 8
  if ($reasons.Count -gt 0) { exit 3 }
}

switch ($Cmd) {
  'status' { $s = Load-State; Set-Prop $s 'source' (Head); Set-Prop $s 'busy' (Busy); $s | ConvertTo-Json -Depth 8 }
  'build' { Do-Build }
  'apply' { Do-Apply }
  'rollback' { Do-Rollback }
  'verify' { Do-Verify }
  'tick' {
    Do-Build
    $s = Load-State
    if ($s.staged -and $s.prefs.applyWhenIdle -and (Busy) -eq 0 -and (Idle-Minutes) -ge 10) { $script:Restart = $true; Do-Apply }
  }
  default { Write-Output 'usage: aporia-update status|build [-Force]|apply [-Restart -ByUser]|rollback|verify [-Dir PATH] [-Expect COMMIT]|tick' ; exit 1 }
}
