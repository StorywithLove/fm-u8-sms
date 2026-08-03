param(
    [string]$TaskName = 'FmU8SmsBridge'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$powerShellPath = Join-Path $PSHOME 'powershell.exe'
$runnerPath = Join-Path $PSScriptRoot 'run-hidden.ps1'
$envFile = Join-Path $projectRoot '.env'

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Missing $envFile. Copy .env.example to .env and configure it first."
}
if (-not (Test-Path -LiteralPath $runnerPath)) {
    throw "Missing hidden task runner: $runnerPath"
}

$arguments = @(
    '-NoLogo'
    '-NoProfile'
    '-NonInteractive'
    '-WindowStyle Hidden'
    '-ExecutionPolicy Bypass'
    "-File `"$runnerPath`""
    "-NodePath `"$nodePath`""
) -join ' '
$action = New-ScheduledTaskAction `
    -Execute $powerShellPath `
    -Argument $arguments `
    -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
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
    -Description 'Run the local FM U8 SMS inbox in the background and keep its history synchronized.'

try {
    Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
} catch [Microsoft.Management.Infrastructure.CimException] {
    if ($_.Exception.Message -match '(?i)access is denied|拒绝访问') {
        throw (
            "Windows denied access while updating task '$TaskName'. " +
            'Open PowerShell as Administrator and run this installer again.'
        )
    }
    throw
}
Write-Host "Installed scheduled task: $TaskName"
Write-Host 'The SMS service runs in the background without a console window.'
Write-Host "The task will start at the next sign-in. Start it now with:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
