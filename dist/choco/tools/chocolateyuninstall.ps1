$ErrorActionPreference = 'Stop'
$packageName = 'pinemail'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"

Uninstall-ChocolateyZipPackage -PackageName $packageName -ZipFileName 'pinemail-v0.1.0-x86_64-pc-windows-msvc.zip'
