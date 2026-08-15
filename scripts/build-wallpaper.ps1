$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "dist"))
$stagingRoot = [System.IO.Path]::GetFullPath((Join-Path $distRoot "liquid-glass-icons"))
$archivePath = [System.IO.Path]::GetFullPath((Join-Path $distRoot "liquid-glass-icons-lively.zip"))
$distPrefix = $distRoot + [System.IO.Path]::DirectorySeparatorChar

if (-not $stagingRoot.StartsWith($distPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to build outside the dist directory: $stagingRoot"
}

if (-not $archivePath.StartsWith($distPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to write an archive outside the dist directory: $archivePath"
}

New-Item -ItemType Directory -Path $distRoot -Force | Out-Null

if (Test-Path -LiteralPath $stagingRoot) {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}

if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

@(
  "LivelyInfo.json",
  "LivelyProperties.json"
) | ForEach-Object {
  Copy-Item -LiteralPath (Join-Path $projectRoot $_) -Destination $stagingRoot
}

Copy-Item -LiteralPath (Join-Path $projectRoot "css") -Destination $stagingRoot -Recurse

& node (Join-Path $projectRoot "scripts\build-classic-bundle.mjs") $stagingRoot
if ($LASTEXITCODE -ne 0) {
  throw "Failed to build the classic JavaScript wallpaper bundle."
}

Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $archivePath -CompressionLevel Optimal

Write-Host "Lively wallpaper folder: $stagingRoot"
Write-Host "Lively wallpaper archive: $archivePath"
