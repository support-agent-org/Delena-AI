@echo off
REM dev-tui.bat - Attach TUI to dev server on port 4200

set XDG_DATA_HOME=%USERPROFILE%\.local\share-dev
set XDG_CONFIG_HOME=%USERPROFILE%\.config-dev
set XDG_STATE_HOME=%USERPROFILE%\.local\state-dev
set XDG_CACHE_HOME=%USERPROFILE%\.cache-dev

cd /d "%~dp0"
bun dev attach http://127.0.0.1:4200 %*
