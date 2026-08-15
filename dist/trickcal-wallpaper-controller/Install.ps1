param(
  [switch]$NoAutoStart
)

$ErrorActionPreference = "Stop"

$packageRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$appRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "TrickcalWallpaper"))
$targetRoot = [System.IO.Path]::GetFullPath((Join-Path $appRoot "Controller"))
$targetPrefix = $appRoot + [System.IO.Path]::DirectorySeparatorChar
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runName = "TrickcalWallpaperController"

if (-not $targetRoot.StartsWith($targetPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to install outside the TrickcalWallpaper app directory: $targetRoot"
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  throw "Node.js is required. Install the current Node.js LTS release and run this installer again."
}

if (-not (Test-Path -LiteralPath (Join-Path $packageRoot "controller.mjs"))) {
  throw "controller.mjs is missing from the controller package."
}

if (-not (Test-Path -LiteralPath (Join-Path $packageRoot "web\index.html"))) {
  throw "The controller web assets are missing. Rebuild the controller package."
}

$existingPidFile = Join-Path $targetRoot "controller.pid"
if (Test-Path -LiteralPath $existingPidFile) {
  $existingPid = Get-Content -LiteralPath $existingPidFile -Raw -ErrorAction SilentlyContinue
  if ($existingPid -match '^\d+$') {
    Stop-Process -Id ([int]$existingPid) -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 300
  }
}

New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $packageRoot "controller.mjs") -Destination $targetRoot -Force
Copy-Item -LiteralPath (Join-Path $packageRoot "Start-Controller.ps1") -Destination $targetRoot -Force
$legacyLauncher = Join-Path $targetRoot "Start-Controller.vbs"
if (Test-Path -LiteralPath $legacyLauncher) {
  Remove-Item -LiteralPath $legacyLauncher -Force
}
$targetWeb = Join-Path $targetRoot "web"
if (Test-Path -LiteralPath $targetWeb) {
  Remove-Item -LiteralPath $targetWeb -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $packageRoot "web") -Destination $targetRoot -Recurse -Force
Set-Content -LiteralPath (Join-Path $targetRoot "node-path.txt") -Value $node.Source -Encoding Default

$powershell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$launcher = Join-Path $targetRoot "Start-Controller.ps1"
$runCommand = "`"$powershell`" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`""

if (-not $NoAutoStart) {
  New-Item -Path $runKey -Force | Out-Null
  Set-ItemProperty -Path $runKey -Name $runName -Value $runCommand
}

Start-Process `
  -FilePath $powershell `
  -ArgumentList @("-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", "`"$launcher`"") `
  -WindowStyle Hidden

Write-Host "Trickcal Wallpaper Controller installed: $targetRoot"
Write-Host "Auto start: $(-not $NoAutoStart)"
