@echo off
setlocal
set "INTRUTH_TEMP_DIR="
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
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $stream=[IO.File]::OpenRead($env:INTRUTH_NODE_ARCHIVE); $hash=[Security.Cryptography.SHA256]::Create(); try { $actual=[BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose(); $hash.Dispose() }; if ($actual -ne $env:INTRUTH_NODE_SHA) { throw 'Node.js checksum mismatch. Installation stopped.' }; [void][Reflection.Assembly]::LoadFrom([IO.Path]::Combine([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory(),'System.IO.Compression.FileSystem.dll')); $stage=[IO.Path]::Combine($env:INTRUTH_TEMP_DIR,'unpack'); [IO.Compression.ZipFile]::ExtractToDirectory($env:INTRUTH_NODE_ARCHIVE,$stage); [void][IO.Directory]::CreateDirectory($env:INTRUTH_RUNTIME_PARENT); $source=[IO.Path]::Combine($stage,('node-v'+$env:INTRUTH_NODE_VERSION+'-'+$env:INTRUTH_NODE_TARGET)); [IO.Directory]::Move($source,$env:INTRUTH_NODE_DIR)"
if errorlevel 1 goto failed
rmdir /s /q "%INTRUTH_TEMP_DIR%"
:install
set "PATH=%INTRUTH_NODE_DIR%;%PATH%"
"%INTRUTH_NODE_DIR%\node.exe" "%~dp0scripts\install-helper.cjs"
if errorlevel 1 goto failed
echo Setup complete. Load/reload realtime-factcheck in Chrome and open InTruth.
if not defined INTRUTH_SETUP_UNATTENDED pause
exit /b 0
:failed
echo Installation failed. No security policy was changed.
if defined INTRUTH_TEMP_DIR if exist "%INTRUTH_TEMP_DIR%" rmdir /s /q "%INTRUTH_TEMP_DIR%"
if not defined INTRUTH_SETUP_UNATTENDED pause
exit /b 1
