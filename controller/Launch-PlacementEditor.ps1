param(
  [Parameter(Mandatory = $true)]
  [string]$EdgePath,

  [Parameter(Mandatory = $true)]
  [string]$EditorUrl,

  [Parameter(Mandatory = $true)]
  [string]$ProfilePath
)

$ErrorActionPreference = "Stop"

$edge = [System.IO.Path]::GetFullPath($EdgePath)
$profile = [System.IO.Path]::GetFullPath($ProfilePath)

if (-not (Test-Path -LiteralPath $edge -PathType Leaf)) {
  throw "Microsoft Edge was not found: $edge"
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

$edgeProcess = Start-Process `
  -FilePath $edge `
  -ArgumentList $arguments `
  -WindowStyle Maximized `
  -PassThru

$deadline = [DateTime]::UtcNow.AddSeconds(8)
do {
  Start-Sleep -Milliseconds 100
  $edgeProcess.Refresh()
  if ($edgeProcess.HasExited) {
    throw "Microsoft Edge closed before the placement editor became visible."
  }
} while ($edgeProcess.MainWindowHandle -eq 0 -and [DateTime]::UtcNow -lt $deadline)

if ($edgeProcess.MainWindowHandle -eq 0) {
  Stop-Process -Id $edgeProcess.Id -Force -ErrorAction SilentlyContinue
  throw "Microsoft Edge started without a visible placement editor window."
}

Write-Output $edgeProcess.Id
