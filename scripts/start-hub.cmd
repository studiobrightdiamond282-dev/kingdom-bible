@echo off
rem ---------------------------------------------------------------------------
rem KINGDOM BIBLE - bring the ministry hub back up automatically.
rem Safe to run repeatedly: both steps are idempotent.
rem Place a shortcut to this file in the Windows Startup folder to use it at boot.
rem ---------------------------------------------------------------------------
setlocal
set "APPDIR=C:\Users\DELL\Downloads\Stanley Document\KINGDOM BIBLE APP\kingdom-bible-v1.2.1-upgrade (1)\kingdom-bible"
cd /d "%APPDIR%"

rem 1. Tailscale Funnel. The config already persists inside tailscaled, so this
rem    normally does nothing; re-asserting it makes a fresh install self-heal.
if exist "C:\Program Files\Tailscale\tailscale.exe" (
  "C:\Program Files\Tailscale\tailscale.exe" funnel --bg 4173 >nul 2>&1
)

rem 2. Start the hub ONLY when nothing is already listening on 4173, so running
rem    this twice can never throw EADDRINUSE and kill a live service.
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue)) { Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '%APPDIR%' -WindowStyle Hidden; Write-Output 'hub started' } else { Write-Output 'hub already listening on 4173 - left alone' }"

endlocal