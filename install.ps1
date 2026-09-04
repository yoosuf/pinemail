# Pine Mail PowerShell Installer for Windows
# Usage: iwr -useb https://raw.githubusercontent.com/yoosuf/pinemail/main/install.ps1 | iex
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = "yoosuf/pinemail"
$DefaultInstallDir = Join-Path $ENV:USERPROFILE ".pinemail\bin"
$InstallDir = if ($ENV:PINEMAIL_INSTALL_DIR) { $ENV:PINEMAIL_INSTALL_DIR } else { $DefaultInstallDir }

if (-not (Test-Path -Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

$Tag = $ENV:PINEMAIL_VERSION
if (-not $Tag) {
    try {
        $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "PineMail-Installer" }
        $Tag = $Release.tag_name
    } catch {
        $Tag = "v0.1.0"
    }
}

$Target = "x86_64-pc-windows-msvc"
$Url = "https://github.com/$Repo/releases/download/$Tag/pinemail-$Tag-$Target.zip"
$ZipPath = Join-Path $ENV:TEMP "pinemail-$Tag.zip"

Write-Host "🌲 Pine Mail Official Windows Installer" -ForegroundColor Cyan
Write-Host "Downloading Pine Mail $Tag for Windows ($Target)..." -ForegroundColor White

Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing

Write-Host "Extracting binaries to $InstallDir..." -ForegroundColor White
Expand-Archive -Path $ZipPath -DestinationPath $InstallDir -Force
Remove-Item -Path $ZipPath -Force -ErrorAction SilentlyContinue

# Update User PATH environment variable
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -notlike "*$InstallDir*") {
    $NewPath = "$UserPath;$InstallDir"
    [Environment]::SetEnvironmentVariable("PATH", $NewPath, "User")
    $ENV:PATH = "$ENV:PATH;$InstallDir"
    Write-Host "Added $InstallDir to User PATH." -ForegroundColor Yellow
}

Write-Host "✅ Pine Mail $Tag successfully installed to $InstallDir" -ForegroundColor Green
Write-Host ""
Write-Host "To start Pine Mail:" -ForegroundColor White
Write-Host "  pinemail          # SMTP on :1025, Web UI & REST API on :8025" -ForegroundColor Gray
Write-Host "  pinemail-mcp      # MCP stdio server for AI agents" -ForegroundColor Gray
