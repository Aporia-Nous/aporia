@echo off
rem Agents: run "aporia-update build" after committing to C:\Tools\aporia. It stages a new build and never restarts Aporia.
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0aporia-update.ps1" %*
