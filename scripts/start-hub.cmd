@echo off
rem ---------------------------------------------------------------------------
rem KINGDOM BIBLE - bring the ministry hub back up automatically.
rem Safe to run repeatedly: every step is idempotent.
rem Place a shortcut to this file in the Windows Startup folder to use it at boot.
rem ---------------------------------------------------------------------------
setlocal
set "APPDIR=C:\Users\DELL\Downloads\Stanley Document\KINGDOM BIBLE APP\kingdom-bible-v1.2.1-upgrade (1)\kingdom-bible"
set "TS=C:\Program Files\Tailscale\tailscale.exe"
set "LOG=%TEMP%\kingdom-bible-hub.log"
cd /d "%APPDIR%"
echo [%DATE% %TIME%] start-hub invoked > "%LOG%"

rem 1. Tailscale tunnel. This step is NOT the same as re-asserting Funnel below:
rem    `tailscale funnel` only STORES the serve config, it never connects the
rem    node. So when the tunnel is off, Funnel still reports "on" while serving
rem    nothing at all, and every phone just gets a connection error with no clue
rem    why. On 2026-10-03 that exact state took the public site offline for ~8
rem    minutes: the Windows service was Running but `WantRunning` was false
rem    (Tailscale toggled off in the network flyout), so `tailscale status`
rem    reported "Tailscale is stopped" while Funnel looked configured.
rem    `up` is what actually reconnects. --timeout stops a Startup run from
rem    hanging forever on a UAC or browser login prompt.
if exist "%TS%" (
  "%TS%" up --timeout=30s >> "%LOG%" 2>&1

  rem Wait for the node to report Connected before trusting Funnel. `status`
  rem exits non-zero exactly while it is stopped, which is the state we are
  rem trying to escape. 20 tries x ~2s gives the hotspot/mobile link time to
  rem reach the control plane.
  set "TSREADY="
  for /l %%i in (1,1,20) do (
    if not defined TSREADY (
      "%TS%" status >nul 2>&1
      if not errorlevel 1 set "TSREADY=1"
      if not defined TSREADY ping -n 2 127.0.0.1 >nul
    )
  )
  if defined TSREADY (
    "%TS%" funnel --bg 4173 >> "%LOG%" 2>&1
    echo Funnel re-asserted >> "%LOG%"
  ) else (
    echo WARNING: tailscaled did not connect - the public URL will serve nothing >> "%LOG%"
  )
)

rem 2. Start the hub ONLY when nothing is already listening on 4173, so running
rem    this twice can never throw EADDRINUSE and kill a live service.
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue)) { Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '%APPDIR%' -WindowStyle Hidden; Write-Output 'hub started' } else { Write-Output 'hub already listening on 4173 - left alone' }" >> "%LOG%" 2>&1

rem 3. Prove the public path end to end, not just the local process. This is the
rem    check that would have caught today's outage automatically.
curl -s -o NUL -w "public /health -> HTTP %%{http_code}\n" -m 20 https://desktop-dqg29pr.tail876272.ts.net/health >> "%LOG%" 2>&1

endlocal