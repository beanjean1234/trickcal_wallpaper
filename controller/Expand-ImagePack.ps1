param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,

  [Parameter(Mandatory = $true)]
  [string]$DestinationPath
)

$ErrorActionPreference = "Stop"

$archive = [System.IO.Path]::GetFullPath($ArchivePath)
$destination = [System.IO.Path]::GetFullPath($DestinationPath)

if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
  throw "Image pack archive not found: $archive"
}

New-Item -ItemType Directory -Path $destination -Force | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
