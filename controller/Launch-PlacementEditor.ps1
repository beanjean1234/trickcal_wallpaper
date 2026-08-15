param(
  [Parameter(Mandatory = $true)]
  [string]$BrowserPath,

  [Parameter(Mandatory = $true)]
  [ValidateSet("Google Chrome", "Microsoft Edge")]
  [string]$BrowserName,

  [Parameter(Mandatory = $true)]
  [string]$EditorUrl,

  [Parameter(Mandatory = $true)]
  [string]$ProfilePath
)

$ErrorActionPreference = "Stop"

$browser = [System.IO.Path]::GetFullPath($BrowserPath)
$profile = [System.IO.Path]::GetFullPath($ProfilePath)

if (-not (Test-Path -LiteralPath $browser -PathType Leaf)) {
  throw "$BrowserName was not found: $browser"
}

$parsedUrl = $null
if (-not [System.Uri]::TryCreate($EditorUrl, [System.UriKind]::Absolute, [ref]$parsedUrl)) {
  throw "The placement editor URL is invalid."
}

if ($parsedUrl.Scheme -ne "http" -or $parsedUrl.Host -ne "127.0.0.1") {
  throw "The placement editor URL must use the local controller."
}

New-Item -ItemType Directory -Path $profile -Force | Out-Null

$arguments = @(
  "--app=$EditorUrl"
  "--start-maximized"
  "--new-window"
  "--no-first-run"
  "--disable-background-mode"
  "--disable-session-crashed-bubble"
  "--user-data-dir=`"$profile`""
)

$browserProcess = Start-Process `
  -FilePath $browser `
  -ArgumentList $arguments `
  -WindowStyle Maximized `
  -PassThru

$deadline = [DateTime]::UtcNow.AddSeconds(8)
do {
  Start-Sleep -Milliseconds 100
  $browserProcess.Refresh()
  if ($browserProcess.HasExited) {
    throw "$BrowserName closed before the placement editor became visible."
  }
} while ($browserProcess.MainWindowHandle -eq 0 -and [DateTime]::UtcNow -lt $deadline)

if ($browserProcess.MainWindowHandle -eq 0) {
  Stop-Process -Id $browserProcess.Id -Force -ErrorAction SilentlyContinue
  throw "$BrowserName started without a visible placement editor window."
}

Write-Output $browserProcess.Id
