[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$TaskName = 'DSH Harness Web'
)

$ErrorActionPreference = 'Stop'

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Output "Scheduled task not found: $TaskName"
    exit 0
}

if ($PSCmdlet.ShouldProcess($TaskName, 'unregister DSH Harness web autostart task')) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "Scheduled task removed: $TaskName"
}
