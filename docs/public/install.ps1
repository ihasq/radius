# Radius installer for Windows
# Usage: irm https://radius-ai.pages.dev/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo = "ihasq/radius"
$InstallDir = if ($env:RADIUS_INSTALL_DIR) { $env:RADIUS_INSTALL_DIR } else { "$env:USERPROFILE\.radius\bin" }

function Write-Info($msg)  { Write-Host "[radius] $msg" -ForegroundColor Cyan }
function Write-Err($msg)   { Write-Host "[radius] $msg" -ForegroundColor Red; exit 1 }

# Detect architecture (compatible with Windows PowerShell 5.1 and PowerShell 7+)
$Arch = $env:PROCESSOR_ARCHITECTURE
switch ($Arch) {
    "AMD64" { $Platform = "win-x64" }
    "x86"   { Write-Err "32-bit Windows is not supported." }
    default { Write-Err "Unsupported architecture: $Arch" }
}

# Get latest version
Write-Info "Fetching latest version..."
try {
    $Response = Invoke-WebRequest -Uri "https://github.com/$Repo/releases/latest" -MaximumRedirection 0 -ErrorAction SilentlyContinue -UseBasicParsing 2>&1
    $Location = $Response.Headers.Location
    if (-not $Location) {
        $Location = $Response.Headers["Location"]
    }
    $Version = ($Location -split '/')[-1]
} catch {
    try {
        $Location = $_.Exception.Response.Headers.Location.ToString()
        $Version = ($Location -split '/')[-1]
    } catch {
        Write-Err "Failed to fetch latest version from GitHub."
    }
}
if (-not $Version) {
    Write-Err "Failed to fetch latest version from GitHub."
}

# Download
$Archive = "radius-$Platform.zip"
$Url = "https://github.com/$Repo/releases/download/$Version/$Archive"
$TmpDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "radius-install-$([System.IO.Path]::GetRandomFileName())")
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null
$ZipPath = Join-Path $TmpDir $Archive

Write-Info "Downloading Radius $Version for $Platform..."
try {
    Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing
} catch {
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
    Write-Err "Download failed. No release found for $Platform at $Version."
}

# Extract
Write-Info "Extracting..."
Expand-Archive -Path $ZipPath -DestinationPath $TmpDir -Force

# Install
Write-Info "Installing to $InstallDir..."
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item (Join-Path $TmpDir "radius-$Platform.exe")  (Join-Path $InstallDir "radius.exe")  -Force
Copy-Item (Join-Path $TmpDir "radiusd-$Platform.exe") (Join-Path $InstallDir "radiusd.exe") -Force

# Cleanup
Remove-Item -Recurse -Force $TmpDir

# Add to PATH
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$InstallDir;$UserPath", "User")
    Write-Info "Added $InstallDir to user PATH."
}

# Update current session PATH
if ($env:Path -notlike "*$InstallDir*") {
    $env:Path = "$InstallDir;$env:Path"
}

Write-Info "Radius $Version installed successfully."
Write-Info ""
Write-Info "  radius --help"
Write-Info ""
Write-Info "Restart your terminal if 'radius' is not recognized."
