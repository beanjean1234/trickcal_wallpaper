param(
  [switch]$RemoveSavedLayout,
  [switch]$RemoveImageLibrary
)

$ErrorActionPreference = "Stop"

$appRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "TrickcalWallpaper"))
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $appRoot "Controller"))
$targetPrefix = $appRoot + [System.IO.Path]::DirectorySeparatorChar
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runName = "TrickcalWallpaperController"

if (-not $targetRoot.StartsWith($targetPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to uninstall outside the TrickcalWallpaper app directory: $targetRoot"
}

Remove-ItemProperty -Path $runKey -Name $runName -ErrorAction SilentlyContinue

$pidFile = Join-Path $targetRoot "controller.pid"
if (Test-Path -LiteralPath $pidFile) {
  $controllerPid = Get-Content -LiteralPath $pidFile -Raw -ErrorAction SilentlyContinue
  if ($controllerPid -match '^\d+$') {
    Stop-Process -Id ([int]$controllerPid) -Force -ErrorAction SilentlyContinue
  }
}

if (Test-Path -LiteralPath $targetRoot) {
  Remove-Item -LiteralPath $targetRoot -Recurse -Force
}

if ($RemoveSavedLayout) {
  $layoutPath = Join-Path $appRoot "layout.json"
  $edgeProfile = Join-Path $appRoot "EdgePlacementProfile"
  if (Test-Path -LiteralPath $layoutPath) {
    Remove-Item -LiteralPath $layoutPath -Force
  }
  if (Test-Path -LiteralPath $edgeProfile) {
    Remove-Item -LiteralPath $edgeProfile -Recurse -Force
  }
}

if ($RemoveImageLibrary) {
  $libraryRoot = Join-Path $appRoot "Library"
  if (Test-Path -LiteralPath $libraryRoot) {
    Remove-Item -LiteralPath $libraryRoot -Recurse -Force
  }
}

Write-Host "Trickcal Wallpaper Controller uninstalled."
Write-Host "Saved layout removed: $RemoveSavedLayout"
Write-Host "Image library removed: $RemoveImageLibrary"
