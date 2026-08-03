param(
    [Parameter(Mandatory = $true)]
    [string]$NodePath
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$entryPoint = Join-Path $projectRoot 'src\server.js'
$envFile = Join-Path $projectRoot '.env'

if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
    throw "Node.js executable not found: $NodePath"
}
if (-not (Test-Path -LiteralPath $entryPoint -PathType Leaf)) {
    throw "Server entry point not found: $entryPoint"
}
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "Configuration file not found: $envFile"
}

& $NodePath "--env-file-if-exists=$envFile" $entryPoint
exit $LASTEXITCODE
