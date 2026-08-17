param(
  [switch]$RemoveSavedLayout,
  [switch]$RemoveImageLibrary,
  [switch]$RemoveBackground
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
  $browserProfiles = @(
    (Join-Path $appRoot "ChromePlacementProfileVisibleV1"),
    (Join-Path $appRoot "EdgePlacementProfileVisibleV2"),
    (Join-Path $appRoot "EdgePlacementProfile")
  )
  if (Test-Path -LiteralPath $layoutPath) {
    Remove-Item -LiteralPath $layoutPath -Force
  }
  foreach ($browserProfile in $browserProfiles) {
    if (Test-Path -LiteralPath $browserProfile) {
      Remove-Item -LiteralPath $browserProfile -Recurse -Force
    }
  }
}

if ($RemoveImageLibrary) {
  $libraryRoot = Join-Path $appRoot "Library"
  if (Test-Path -LiteralPath $libraryRoot) {
    Remove-Item -LiteralPath $libraryRoot -Recurse -Force
  }
}

if ($RemoveBackground) {
  $backgroundRoot = Join-Path $appRoot "Background"
  if (Test-Path -LiteralPath $backgroundRoot) {
    Remove-Item -LiteralPath $backgroundRoot -Recurse -Force
  }
}

Write-Host "Trickcal Wallpaper Controller uninstalled."
Write-Host "Saved layout removed: $RemoveSavedLayout"
Write-Host "Image library removed: $RemoveImageLibrary"
Write-Host "Background files removed: $RemoveBackground"
