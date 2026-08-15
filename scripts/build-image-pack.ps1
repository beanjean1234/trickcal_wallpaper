$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$sourceRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "icons"))
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "dist"))
$stagingRoot = [System.IO.Path]::GetFullPath((Join-Path $distRoot "trickcal-wallpaper-images"))
$archivePath = [System.IO.Path]::GetFullPath((Join-Path $distRoot "trickcal-wallpaper-images.zip"))
$distPrefix = $distRoot + [System.IO.Path]::DirectorySeparatorChar

@($stagingRoot, $archivePath) | ForEach-Object {
  if (-not $_.StartsWith($distPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to build an image pack outside dist: $_"
  }
}

if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
  throw "Image source folder not found: $sourceRoot"
}

New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
if (Test-Path -LiteralPath $stagingRoot) {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
Copy-Item -LiteralPath $sourceRoot -Destination (Join-Path $stagingRoot "images") -Recurse -Force

$package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$packVersion = [string]$package.version
if ($env:GITHUB_REF_NAME -match '^v(.+)$') {
  $packVersion = $Matches[1]
}
$metadata = [ordered]@{
  format = 1
  id = "trickcal-wallpaper-official-images"
  name = "Trickcal Wallpaper Images"
  version = $packVersion
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stagingRoot "pack.json") -Encoding UTF8

Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $archivePath -CompressionLevel Optimal

$imageCount = (Get-ChildItem -LiteralPath (Join-Path $stagingRoot "images") -File -Recurse | Where-Object {
  $_.Extension -match '^\.(webp|png|jpe?g)$'
}).Count

Write-Host "Image pack folder: $stagingRoot"
Write-Host "Image pack archive: $archivePath"
Write-Host "Image count: $imageCount"
