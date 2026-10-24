@echo off
setlocal
set "INTRUTH_NODE_VERSION=24.22.1"
set "INTRUTH_NODE_TARGET=win-x64"
set "INTRUTH_NODE_SHA=d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" goto arm64
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" goto arm64
goto setup
:arm64
set "INTRUTH_NODE_TARGET=win-arm64"
set "INTRUTH_NODE_SHA=a0c807319fede24c4a0d8f84564c82a619bd313b16b10c007c383c2609e99171"
:setup
set "INTRUTH_RUNTIME_PARENT=%LOCALAPPDATA%\InTruth\runtime"
set "INTRUTH_NODE_DIR=%INTRUTH_RUNTIME_PARENT%\node-v%INTRUTH_NODE_VERSION%-%INTRUTH_NODE_TARGET%"
if exist "%INTRUTH_NODE_DIR%\node.exe" goto install
set "INTRUTH_TEMP_DIR=%TEMP%\intruth-node-%RANDOM%-%RANDOM%"
if exist "%INTRUTH_TEMP_DIR%" goto setup
mkdir "%INTRUTH_TEMP_DIR%"
if errorlevel 1 goto failed
set "INTRUTH_NODE_ARCHIVE=%INTRUTH_TEMP_DIR%\node.zip"
curl.exe --fail --show-error --location --proto =https --tlsv1.2 --retry 3 "https://nodejs.org/dist/v%INTRUTH_NODE_VERSION%/node-v%INTRUTH_NODE_VERSION%-%INTRUTH_NODE_TARGET%.zip" -o "%INTRUTH_NODE_ARCHIVE%"
if errorlevel 1 goto failed
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; if ((Get-FileHash -LiteralPath $env:INTRUTH_NODE_ARCHIVE -Algorithm SHA256).Hash -ine $env:INTRUTH_NODE_SHA) { throw 'Node.js checksum mismatch. Installation stopped.' }; New-Item -ItemType Directory -Force -Path $env:INTRUTH_RUNTIME_PARENT | Out-Null; Expand-Archive -LiteralPath $env:INTRUTH_NODE_ARCHIVE -DestinationPath $env:INTRUTH_RUNTIME_PARENT -Force"
if errorlevel 1 goto failed
rmdir /s /q "%INTRUTH_TEMP_DIR%"
:install
set "PATH=%INTRUTH_NODE_DIR%;%PATH%"
"%INTRUTH_NODE_DIR%\node.exe" "%~dp0scripts\install-helper.cjs"
if errorlevel 1 goto failed
echo Setup complete. Load/reload realtime-factcheck in Chrome and open InTruth.
pause
exit /b 0
:failed
echo Installation failed. No security policy was changed.
if defined INTRUTH_TEMP_DIR if exist "%INTRUTH_TEMP_DIR%" rmdir /s /q "%INTRUTH_TEMP_DIR%"
pause
exit /b 1
