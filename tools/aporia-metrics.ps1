# aporia-metrics.ps1 - Phase 0 baseline metrics for the Aporia optimization program.
#
# Read-only. Reports process/memory pressure and source-level interval/timer usage so
# later phases can prove an improvement against this baseline.
#
# Deliberately NEVER prints full process command lines (they can contain secrets).
# Windows PowerShell 5.1 compatible. No && / || chaining.

$ErrorActionPreference = 'Stop'

# tools\ -> repo root
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $repoRoot) { $repoRoot = (Get-Location).Path }

function Write-Header($text) {
  Write-Output ""
  Write-Output ("--- " + $text + " ---")
}

function Get-RelativePath($full) {
  $root = $repoRoot.TrimEnd('\') + '\'
  if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($root.Length)
  }
  return $full
}

Write-Output "=== Aporia metrics ==="
Write-Output ("timestamp: " + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))
Write-Output ("repo root: " + $repoRoot)

# --- 1. node.exe process count + total working set -------------------------------
$nodes = @(Get-Process -Name node -ErrorAction SilentlyContinue)
$nodeCount = $nodes.Count
$nodeMB = 0
if ($nodeCount -gt 0) {
  $sum = ($nodes | Measure-Object -Property WorkingSet64 -Sum).Sum
  $nodeMB = [math]::Round($sum / 1MB, 1)
}
Write-Header "node.exe"
Write-Output ("node.exe count: " + $nodeCount)
Write-Output ("node.exe total working set: " + $nodeMB + " MB")

# --- 2. node.exe grouped by script basename (no command lines printed) -----------
Write-Header "node.exe by script (basename)"
# Capture the command line only to extract a basename; the command line itself is never printed.
$nodeCmdLines = @{}
foreach ($p in (Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue)) {
  $nodeCmdLines[[int]$p.ProcessId] = $p.CommandLine
}
$scriptRegex = [regex]'([^\\/\"\s]+\.(mjs|cjs|js))'
$groups = @{}
foreach ($p in $nodes) {
  $cmd = $nodeCmdLines[[int]$p.Id]
  $label = '(inline/-e)'
  if ($cmd) {
    $m = $scriptRegex.Match($cmd)
    if ($m.Success) { $label = $m.Groups[1].Value }
  }
  if (-not $groups.ContainsKey($label)) {
    $groups[$label] = [pscustomobject]@{ Script = $label; Count = 0; MB = 0.0 }
  }
  $groups[$label].Count += 1
  $groups[$label].MB += [math]::Round($p.WorkingSet64 / 1MB, 1)
}
$groups.Values | Sort-Object -Property MB -Descending | ForEach-Object {
  $_.MB = [math]::Round($_.MB, 1)
  $_
} | Format-Table -AutoSize

# --- 3. Aporia / electron process counts -----------------------------------------
Write-Header "app processes"
$aporias = @(Get-Process -Name 'Aporia' -ErrorAction SilentlyContinue)
$electrons = @(Get-Process -Name 'electron' -ErrorAction SilentlyContinue)
Write-Output ("Aporia processes: " + $aporias.Count)
Write-Output ("electron processes: " + $electrons.Count)

# --- 4. setInterval / setTimeout occurrences in packages/** source ----------------
Write-Header "timers in packages/** source"
$srcRoot = Join-Path $repoRoot 'packages'
$srcFiles = @()
if (Test-Path -LiteralPath $srcRoot) {
  $srcFiles = @(Get-ChildItem -Path $srcRoot -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx,*.mjs,*.cjs -ErrorAction SilentlyContinue |
    Where-Object {
      $_.FullName -notmatch '\\node_modules\\' -and
      $_.FullName -notmatch '\\dist\\' -and
      $_.FullName -notmatch '\.test\.'
    })
}
$setIntervalCount = 0
$setTimeoutCount = 0
foreach ($f in $srcFiles) {
  $text = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
  if (-not $text) { continue }
  $setIntervalCount += ([regex]::Matches($text, 'setInterval')).Count
  $setTimeoutCount += ([regex]::Matches($text, 'setTimeout')).Count
}
Write-Output ("files scanned: " + $srcFiles.Count + " (excluded node_modules, dist, *.test.*)")
Write-Output ("setInterval occurrences: " + $setIntervalCount)
Write-Output ("setTimeout occurrences: " + $setTimeoutCount)

# --- 5. app startup marks ---------------------------------------------------------
Write-Header "startup marks"
$marksFile = Join-Path $repoRoot 'packages\desktop\src\main\lifecycle\marks.ts'
$marksFound = $false
if (Test-Path -LiteralPath $marksFile) {
  $marksText = Get-Content -LiteralPath $marksFile -Raw -ErrorAction SilentlyContinue
  $fieldNames = @()
  $rec = [regex]::Match($marksText, 'Record<(?<body>[^>]+)>')
  if ($rec.Success) {
    $fieldNames = @([regex]::Matches($rec.Groups['body'].Value, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
  }
  # 'entry' sits outside the Record<...> union in marks.ts.
  $fieldNames = @(@('entry') + $fieldNames | Select-Object -Unique)
  if ($fieldNames.Count -gt 0) {
    Write-Output ("marks fields: " + ($fieldNames -join ', '))
    $escaped = ($fieldNames | ForEach-Object { [regex]::Escape($_) }) -join '|'
    $pattern = '(?<![A-Za-z0-9_])marks\.(' + $escaped + ')\s*=(?!=)'
    $writers = @()
    if (Test-Path -LiteralPath $srcRoot) {
      $writers = @(Get-ChildItem -Path $srcRoot -Recurse -File -Include *.ts,*.tsx -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\dist\\' } |
        Select-String -Pattern $pattern -List -ErrorAction SilentlyContinue |
        ForEach-Object { $_.Path } |
        Select-Object -Unique)
    }
    if ($writers.Count -gt 0) {
      Write-Output "files recording marks:"
      foreach ($w in $writers) { Write-Output ("  " + (Get-RelativePath $w)) }
      $marksFound = $true
    }
  }
}
if (-not $marksFound) {
  Write-Output "marks: not found"
}

Write-Output ""
Write-Output "=== end ==="
