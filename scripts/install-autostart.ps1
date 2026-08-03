param(
    [string]$TaskName = 'FmU8SmsBridge'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$entryPoint = Join-Path $projectRoot 'src\server.js'
$envFile = Join-Path $projectRoot '.env'

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Missing $envFile. Copy .env.example to .env and configure it first."
}

$arguments = "--env-file-if-exists=`"$envFile`" `"$entryPoint`""
$action = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument $arguments `
    -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal `
    -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Limited
$task = New-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'Run the local FM U8 SMS inbox and keep its message history synchronized.'

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Write-Host "Installed scheduled task: $TaskName"
Write-Host "The task will start at the next sign-in. Start it now with:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
