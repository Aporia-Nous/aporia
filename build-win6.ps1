$env:PATH="C:\Tools\node22;$env:USERPROFILE\.bun\bin;$env:PATH"
$env:OPENCODE_CHANNEL="dev"  # must be dev/latest so the server registers as service.json, which the desktop looks for
cd C:\Tools\aporia\packages\cli
$out="$env:TEMP\aporia-cli-src"
bun run script/build.ts --single --skip-install --outdir=$out\@opencode 2>&1
"CLI_BUILT $LASTEXITCODE"
Get-ChildItem $out\@opencode | % Name
if (Test-Path "$out\@opencode\cli-windows-x64") {
  Copy-Item "$out\@opencode\cli-windows-x64" "$out\@opencode\cli-windows-x64-baseline" -Recurse -Force
  (Get-Content "$out\@opencode\cli-windows-x64-baseline\package.json" -Raw) -replace '"@opencode/cli-windows-x64"','"@opencode/cli-windows-x64-baseline"' | Set-Content "$out\@opencode\cli-windows-x64-baseline\package.json"
  $env:OPENCODE_CLI_DIST="$out\@opencode"; $env:OPENCODE_CHANNEL="prod"
  cd C:\Tools\aporia\packages\desktop
  bun run prebuild 2>&1; bun run build 2>&1; bun run package:win 2>&1
  "DESKTOP_BUILT $LASTEXITCODE"
}


