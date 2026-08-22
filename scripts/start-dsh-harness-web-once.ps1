$ErrorActionPreference = 'Stop'

function Get-EnvOrDefault {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DefaultValue
    )

    $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ([string]::IsNullOrWhiteSpace($value)) {
        $value = [Environment]::GetEnvironmentVariable($Name, 'User')
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }

    return $value
}

function Resolve-NodeCommand {
    $configured = Get-EnvOrDefault -Name 'DSH_GUI_NODE' -DefaultValue ''
    if (-not [string]::IsNullOrWhiteSpace($configured)) {
        return $configured
    }

    $candidates = @(
        'D:\Nodejs\node.exe',
        'C:\Program Files\nodejs\node.exe',
        'node.exe'
    )

    foreach ($candidate in $candidates) {
        if ($candidate -eq 'node.exe') {
            return $candidate
        }
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }
}

$harnessRoot = Get-EnvOrDefault -Name 'DSH_GUI_HARNESS_ROOT' -DefaultValue 'D:\DSH'
$harnessHome = Get-EnvOrDefault -Name 'DSH_GUI_HARNESS_HOME' -DefaultValue (Join-Path $harnessRoot '.dsh')
$hostName = Get-EnvOrDefault -Name 'DSH_GUI_HOST' -DefaultValue '127.0.0.1'
$portText = Get-EnvOrDefault -Name 'DSH_GUI_PORT' -DefaultValue '3080'
$node = Resolve-NodeCommand

$port = 0
if (-not [int]::TryParse($portText, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
    throw "Invalid DSH_GUI_PORT value: $portText"
}

if (-not (Test-Path -LiteralPath $harnessRoot)) {
    throw "DeepSeek Harness root was not found: $harnessRoot"
}

$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Where-Object {
        $_.LocalAddress -eq $hostName -or
        ($hostName -eq '127.0.0.1' -and $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::'))
    } |
    Select-Object -First 1

if ($listener) {
    exit 0
}

$logs = Join-Path $harnessHome 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdout = Join-Path $logs "startup-web-$stamp.out.log"
$stderr = Join-Path $logs "startup-web-$stamp.err.log"

$env:DSH_HOME = $harnessHome

$args = @(
    '--import', 'tsx/esm',
    'apps/cli/src/bin.ts',
    'web',
    '--host', $hostName,
    '--port', "$port"
)

Start-Process `
    -FilePath $node `
    -ArgumentList $args `
    -WorkingDirectory $harnessRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr
