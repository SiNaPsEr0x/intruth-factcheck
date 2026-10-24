# One-time user-level setup; downloaded runtime is checked before execution.
$ErrorActionPreference = 'Stop'
$runtimeVersion = '24.22.1'
$cpu = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
switch ($cpu) {
    'AMD64' { $target = 'win-x64'; $digest = 'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5' }
    'ARM64' { $target = 'win-arm64'; $digest = 'a0c807319fede24c4a0d8f84564c82a619bd313b16b10c007c383c2609e99171' }
    default { throw 'Unsupported Windows CPU.' }
}
$runtimeDirectory = Join-Path $env:LOCALAPPDATA "InTruth\runtime\node-v$runtimeVersion-$target"
$nodeExecutable = Join-Path $runtimeDirectory 'node.exe'
if (!(Test-Path -LiteralPath $nodeExecutable)) {
    $temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
    try {
        $archive = Join-Path $temporaryDirectory 'node.zip'
        Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$runtimeVersion/node-v$runtimeVersion-$target.zip" -OutFile $archive
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest) {
            throw 'Node.js checksum mismatch. Installation stopped.'
        }
        $parentDirectory = Split-Path $runtimeDirectory -Parent
        New-Item -ItemType Directory -Force -Path $parentDirectory | Out-Null
        Expand-Archive -LiteralPath $archive -DestinationPath $parentDirectory -Force
    } finally {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
}
$env:PATH = "$runtimeDirectory;$env:PATH"
& $nodeExecutable (Join-Path $PSScriptRoot 'install-helper.cjs')
if ($LASTEXITCODE -ne 0) { throw 'InTruth helper installation failed.' }
Write-Host 'Setup complete. Load/reload realtime-factcheck in Chrome and open InTruth.'
