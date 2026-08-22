[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$TaskName = 'DSH Harness Web',
    [string]$ScriptPath = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ScriptPath)) {
    $ScriptPath = Join-Path $PSScriptRoot 'start-dsh-harness-web-once.ps1'
}

if (-not (Test-Path -LiteralPath $ScriptPath)) {
    throw "Startup script was not found: $ScriptPath"
}

$resolvedScript = (Resolve-Path -LiteralPath $ScriptPath).Path
$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $resolvedScript)
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal `
    -UserId ("{0}\{1}" -f $env:USERDOMAIN, $env:USERNAME) `
    -LogonType Interactive `
    -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

if ($PSCmdlet.ShouldProcess($TaskName, 'register DSH Harness web autostart task')) {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Description 'Start DeepSeek Harness web backend on user logon.' `
        -Force | Out-Null

    Get-ScheduledTask -TaskName $TaskName
}
