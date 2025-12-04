$ErrorActionPreference = 'Stop'

$packageName = 'qrdrop'
$url64 = 'https://github.com/behnamazimi/qrdrop/releases/latest/download/qrdrop-windows-x64.exe'
$checksum64 = ''
$checksumType64 = 'sha256'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"

$packageArgs = @{
  packageName   = $packageName
  fileType      = 'EXE'
  url64bit      = $url64
  checksum64    = $checksum64
  checksumType64= $checksumType64
  softwareName  = 'qrdrop*'
}

Install-ChocolateyPackage @packageArgs

# Create shim
$binPath = Join-Path $toolsDir "qrdrop.exe"
Install-BinFile -Name "qrdrop" -Path $binPath

