# Radius installer / upgrader for Windows
# Usage: irm https://radius-ai.pages.dev/install.ps1 | iex
#
# Install scripts are served from Cloudflare Pages.
# Signed binaries are downloaded from GitHub Releases.

$ErrorActionPreference = "Stop"

$Repo = if ($env:RADIUS_GITHUB_REPO) { $env:RADIUS_GITHUB_REPO } else { "ihasq/radius" }
$PagesBase = if ($env:RADIUS_PAGES_BASE) { $env:RADIUS_PAGES_BASE } else { "https://radius-ai.pages.dev" }
$RadiusHome = if ($env:RADIUS_HOME) { $env:RADIUS_HOME } else { "$env:USERPROFILE\.radius" }
$InstallDir = if ($env:RADIUS_INSTALL_DIR) { $env:RADIUS_INSTALL_DIR } else { "$RadiusHome\bin" }

function Write-Info($msg)  { Write-Host "[radius] $msg" -ForegroundColor Cyan }
function Write-Err($msg)   { Write-Host "[radius] $msg" -ForegroundColor Red; exit 1 }

$Arch = $env:PROCESSOR_ARCHITECTURE
switch ($Arch) {
    "AMD64" { $Platform = "win-x64" }
    "x86"   { Write-Err "32-bit Windows is not supported." }
    default { Write-Err "Unsupported architecture: $Arch" }
}

function Stop-RadiusDaemon {
    $core = Join-Path $InstallDir "current\core.exe"
    if (Test-Path $core) {
        try { & $core --exec daemon stop 2>$null } catch {}
    }
}

function Get-Sha256Hex([byte[]]$Data) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($Data))).Replace("-", "").ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Expand-GzipBytes([byte[]]$GzipData) {
    $input = New-Object System.IO.MemoryStream(,$GzipData)
    $gzip = New-Object System.IO.Compression.GzipStream($input, [System.IO.Compression.CompressionMode]::Decompress)
    $output = New-Object System.IO.MemoryStream
    try {
        $gzip.CopyTo($output)
        return $output.ToArray()
    } finally {
        $gzip.Dispose()
        $input.Dispose()
        $output.Dispose()
    }
}

function Update-CurrentLink($Hash) {
    $currentLink = Join-Path $InstallDir "current"
    $target = Join-Path $InstallDir $Hash
    if (Test-Path $currentLink) {
        Remove-Item $currentLink -Force -Recurse -ErrorAction SilentlyContinue
    }
    cmd /c mklink /J "$currentLink" "$target" | Out-Null
}

function Get-ReleaseBaseUrl {
    if ($env:RADIUS_RELEASE_URL) {
        return $env:RADIUS_RELEASE_URL
    }
    try {
        $Response = Invoke-WebRequest -Uri "https://github.com/$Repo/releases/latest" -MaximumRedirection 0 -ErrorAction SilentlyContinue -UseBasicParsing 2>&1
        $Location = $Response.Headers.Location
        if (-not $Location) { $Location = $Response.Headers["Location"] }
        $Version = ($Location -split '/')[-1]
    } catch {
        try {
            $Location = $_.Exception.Response.Headers.Location.ToString()
            $Version = ($Location -split '/')[-1]
        } catch {
            Write-Err "Failed to fetch latest version from GitHub."
        }
    }
    if (-not $Version) { Write-Err "Failed to fetch latest version from GitHub." }
    return "https://github.com/$Repo/releases/download/$Version"
}

function Install-FromGitHub {
    Write-Info "Fetching latest release from GitHub..."
    $releaseBase = Get-ReleaseBaseUrl
    $latest = Invoke-RestMethod -Uri "$releaseBase/latest.json" -UseBasicParsing
    $hash = [string]$latest.hash
    $version = [string]$latest.version
    $asset = $latest.assets.$Platform

    if (-not $hash -or -not $asset) {
        Write-Err "Invalid latest.json or unsupported platform $Platform"
    }

    $releaseDir = Join-Path $InstallDir $hash
    $corePath = Join-Path $releaseDir "core.exe"
    $currentLink = Join-Path $InstallDir "current"

    $currentHash = ""
    if (Test-Path $currentLink) {
        try {
            $item = Get-Item $currentLink -Force
            if ($item.Target) { $currentHash = Split-Path $item.Target -Leaf }
        } catch {}
    }

    if ($currentHash -eq $hash -and (Test-Path $corePath)) {
        Write-Info "Already up to date ($version)"
        return
    }

    Write-Info "Downloading Radius $version for $Platform..."
    $gzBytes = [byte[]](Invoke-WebRequest -Uri "$releaseBase/$($asset.url)" -UseBasicParsing).Content
    $actualSha = Get-Sha256Hex $gzBytes
    if ($actualSha -ne [string]$asset.sha256) {
        Write-Err "Integrity check failed: SHA256 mismatch"
    }

    $exeBytes = Expand-GzipBytes $gzBytes
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
    [System.IO.File]::WriteAllBytes($corePath, $exeBytes)

    Update-CurrentLink $hash
    Write-Info "Updated to $version ($hash)"
}

function Install-CliWrappers {
    $RadiusCmdPath = Join-Path $InstallDir "radius.cmd"
    $coreWrapper = Join-Path $InstallDir "radiusd.cmd"

    @"
@echo off
setlocal
set "RADIUS_HOME=$RadiusHome"
set "CORE=%~dp0current\core.exe"
if not exist "%CORE%" (
  echo [radius] error: core binary not found at %CORE% >&2
  exit /b 1
)
"%CORE%" --exec %*
"@ | Out-File -FilePath $coreWrapper -Encoding ASCII

    @"
@echo off
"%~dp0radiusd.cmd" --exec %*
"@ | Out-File -FilePath $RadiusCmdPath -Encoding ASCII
}

Stop-RadiusDaemon
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Install-FromGitHub
Install-CliWrappers

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$InstallDir;$UserPath", "User")
    Write-Info "Added $InstallDir to user PATH."
}

if ($env:Path -notlike "*$InstallDir*") {
    $env:Path = "$InstallDir;$env:Path"
}

Write-Info "Radius installed/upgraded successfully."
Write-Info ""
Write-Info "  radius --help"
Write-Info ""
Write-Info "Restart your terminal if 'radius' is not recognized."
