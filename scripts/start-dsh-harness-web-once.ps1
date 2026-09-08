$ErrorActionPreference = 'Stop'

function Get-EnvOrDefault {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$DefaultValue
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

function ConvertTo-Boolean {
    param([object]$Value)

    return $Value -eq $true -or @('1', 'true', 'yes', 'on') -contains ([string]$Value).ToLowerInvariant()
}

function Get-Setting {
    param(
        [Parameter(Mandatory = $true)][string]$EnvironmentName,
        [Parameter(Mandatory = $true)][string]$ConfigName,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$DefaultValue
    )

    $environmentValue = Get-EnvOrDefault -Name $EnvironmentName -DefaultValue ''
    if (-not [string]::IsNullOrWhiteSpace($environmentValue)) {
        return $environmentValue
    }

    if ($null -ne $script:guiConfig) {
        $property = $script:guiConfig.PSObject.Properties[$ConfigName]
        if ($null -ne $property -and $null -ne $property.Value -and -not [string]::IsNullOrWhiteSpace([string]$property.Value)) {
            return [string]$property.Value
        }
    }

    return $DefaultValue
}

$script:guiConfig = $null
$configCandidates = @()
if (-not [string]::IsNullOrWhiteSpace($env:APPDATA)) {
    $configCandidates += Join-Path $env:APPDATA 'dsh-gui\config.json'
    $configCandidates += Join-Path $env:APPDATA 'DSH GUI\config.json'
}

foreach ($configPath in $configCandidates) {
    if (-not (Test-Path -LiteralPath $configPath)) {
        continue
    }

    try {
        $script:guiConfig = Get-Content -Raw -Encoding UTF8 -LiteralPath $configPath | ConvertFrom-Json
        break
    } catch {
        $script:guiConfig = $null
    }
}

$harnessRoot = Get-Setting -EnvironmentName 'DSH_GUI_HARNESS_ROOT' -ConfigName 'harnessRoot' -DefaultValue 'D:\DSH'
$harnessHome = Get-Setting -EnvironmentName 'DSH_GUI_HARNESS_HOME' -ConfigName 'harnessHome' -DefaultValue (Join-Path $harnessRoot '.dsh')
$hostName = Get-Setting -EnvironmentName 'DSH_GUI_HOST' -ConfigName 'host' -DefaultValue '127.0.0.1'
$portText = Get-Setting -EnvironmentName 'DSH_GUI_PORT' -ConfigName 'port' -DefaultValue '3080'
$lanAccess = ConvertTo-Boolean (Get-Setting -EnvironmentName 'DSH_GUI_LAN_ACCESS' -ConfigName 'lanAccess' -DefaultValue 'false')
$bindHost = if ($lanAccess) { '0.0.0.0' } else { $hostName }
$configuredNode = Get-Setting -EnvironmentName 'DSH_GUI_NODE' -ConfigName 'nodeCommand' -DefaultValue ''
$node = if ([string]::IsNullOrWhiteSpace($configuredNode)) { Resolve-NodeCommand } else { $configuredNode }

$port = 0
if (-not [int]::TryParse($portText, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
    throw "Invalid DSH_GUI_PORT value: $portText"
}

if (-not (Test-Path -LiteralPath $harnessRoot)) {
    throw "DeepSeek Harness root was not found: $harnessRoot"
}

$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Where-Object {
        if ($lanAccess) {
            $_.LocalAddress -in @('0.0.0.0', '::')
        } else {
            $_.LocalAddress -eq $hostName -or
            ($hostName -eq '127.0.0.1' -and $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::'))
        }
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
    '--no-open',
    '--host', $bindHost,
    '--port', "$port"
)

Start-Process `
    -FilePath $node `
    -ArgumentList $args `
    -WorkingDirectory $harnessRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr
