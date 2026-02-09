@echo off
REM Dev server wrapper - uses isolated directories to avoid conflicts with main server

set XDG_DATA_HOME=%USERPROFILE%\.local\share-dev
set XDG_CONFIG_HOME=%USERPROFILE%\.config-dev
set XDG_STATE_HOME=%USERPROFILE%\.local\state-dev
set XDG_CACHE_HOME=%USERPROFILE%\.cache-dev

REM Create directories
if not exist "%XDG_DATA_HOME%\opencode" mkdir "%XDG_DATA_HOME%\opencode"
if not exist "%XDG_CONFIG_HOME%\opencode" mkdir "%XDG_CONFIG_HOME%\opencode"
if not exist "%XDG_STATE_HOME%\opencode" mkdir "%XDG_STATE_HOME%\opencode"
if not exist "%XDG_CACHE_HOME%\opencode" mkdir "%XDG_CACHE_HOME%\opencode"

REM Copy auth from main instance if it doesn't exist
if not exist "%XDG_DATA_HOME%\opencode\auth.json" (
  if exist "%USERPROFILE%\.local\share\opencode\auth.json" (
    copy "%USERPROFILE%\.local\share\opencode\auth.json" "%XDG_DATA_HOME%\opencode\auth.json" >nul 2>&1
  )
)

REM Copy config from main instance if it doesn't exist
if not exist "%XDG_CONFIG_HOME%\opencode\opencode.json" (
  if exist "%USERPROFILE%\.config\opencode\opencode.json" (
    copy "%USERPROFILE%\.config\opencode\opencode.json" "%XDG_CONFIG_HOME%\opencode\opencode.json" >nul 2>&1
  )
)

REM Start server (uses "bun dev serve" which sets --cwd packages/opencode correctly)
REM Load GOOGLE_GENERATIVE_AI_API_KEY from .env file if available
if exist "..\.env" (
  for /f "usebackq delims=" %%a in (`findstr GOOGLE_GENERATIVE_AI_API_KEY ..\.env`) do set "%%a"
)

bun dev serve --port 4200 --hostname 127.0.0.1 %*
