# Quick restart of the installed Aporia app (no rebuild).
# Use when the app just needs a fresh start. To pick up CODE changes you must rebuild
# (see rebuild-aporia.ps1 / the in-app self-update), because the packaged app does not hot-reload UI code.
$exe = "$env:LOCALAPPDATA\Programs\@opencodedesktop\Aporia.exe"
if (-not (Test-Path $exe)) { Write-Host "Aporia.exe not found at $exe"; exit 1 }
Get-Process Aporia -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Start-Process -FilePath $exe
Write-Host "restarted Aporia ($exe)"
