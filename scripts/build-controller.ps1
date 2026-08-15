$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "dist"))
$wallpaperRoot = [System.IO.Path]::GetFullPath((Join-Path $distRoot "liquid-glass-icons"))
$controllerRoot = [System.IO.Path]::GetFullPath((Join-Path $distRoot "trickcal-wallpaper-controller"))
$archivePath = [System.IO.Path]::GetFullPath((Join-Path $distRoot "trickcal-wallpaper-controller.zip"))
$distPrefix = $distRoot + [System.IO.Path]::DirectorySeparatorChar

@($wallpaperRoot, $controllerRoot, $archivePath) | ForEach-Object {
  if (-not $_.StartsWith($distPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to use a controller build path outside dist: $_"
  }
}

if (-not (Test-Path -LiteralPath (Join-Path $wallpaperRoot "index.html"))) {
  throw "Build the Lively wallpaper first: npm run build:wallpaper"
}

if (Test-Path -LiteralPath $controllerRoot) {
  Remove-Item -LiteralPath $controllerRoot -Recurse -Force
}

if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

New-Item -ItemType Directory -Path $controllerRoot -Force | Out-Null

@(
  "controller.mjs",
  "Expand-ImagePack.ps1",
  "Launch-PlacementEditor.ps1",
  "Start-Controller.ps1",
  "Install.ps1",
  "Uninstall.ps1",
  "README.md",
  "Install-Controller.cmd",
  "Uninstall-Controller.cmd"
) | ForEach-Object {
  Copy-Item -LiteralPath (Join-Path (Join-Path $projectRoot "controller") $_) -Destination $controllerRoot
}

Copy-Item -LiteralPath $wallpaperRoot -Destination (Join-Path $controllerRoot "web") -Recurse
Compress-Archive -Path (Join-Path $controllerRoot "*") -DestinationPath $archivePath -CompressionLevel Optimal

Write-Host "Placement controller folder: $controllerRoot"
Write-Host "Placement controller archive: $archivePath"
