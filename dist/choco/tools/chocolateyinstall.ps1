$ErrorActionPreference = 'Stop'
$packageName = 'pinemail'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"
$url64 = 'https://github.com/yoosuf/pinemail/releases/download/v0.1.0/pinemail-v0.1.0-x86_64-pc-windows-msvc.zip'

$packageArgs = @{
  packageName   = $packageName
  unzipLocation = $toolsDir
  url64Bit      = $url64
  checksumType64= 'sha256'
}

Install-ChocolateyZipPackage @packageArgs
