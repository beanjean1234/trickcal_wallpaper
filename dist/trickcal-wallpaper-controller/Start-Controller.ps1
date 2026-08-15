$ErrorActionPreference = "Stop"

$controllerRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$nodePathFile = Join-Path $controllerRoot "node-path.txt"
$controllerScript = Join-Path $controllerRoot "controller.mjs"
$startupLog = Join-Path $controllerRoot "controller-startup.log"

try {
  if (-not (Test-Path -LiteralPath $nodePathFile)) {
    throw "node-path.txt is missing. Reinstall the controller."
  }

  $nodePath = (Get-Content -LiteralPath $nodePathFile -Raw).Trim()
  if (-not (Test-Path -LiteralPath $nodePath)) {
    throw "Node.js was not found at: $nodePath"
  }

  if (-not (Test-Path -LiteralPath $controllerScript)) {
    throw "controller.mjs is missing. Reinstall the controller."
  }

  $pidFile = Join-Path $controllerRoot "controller.pid"
  if (Test-Path -LiteralPath $pidFile) {
    $existingProcessId = Get-Content -LiteralPath $pidFile -Raw -ErrorAction SilentlyContinue
    if ($existingProcessId -match '^\d+$') {
      $existingProcess = Get-Process -Id ([int]$existingProcessId) -ErrorAction SilentlyContinue
      if ($existingProcess -and $existingProcess.ProcessName -eq "node") {
        exit 0
      }
    }
  }

  Start-Process `
    -FilePath $nodePath `
    -ArgumentList "`"$controllerScript`"" `
    -WorkingDirectory $controllerRoot `
    -WindowStyle Hidden | Out-Null
} catch {
  $message = "{0} | {1}" -f (Get-Date).ToString("o"), $_.Exception.Message
  Set-Content -LiteralPath $startupLog -Value $message -Encoding UTF8 -ErrorAction SilentlyContinue
  exit 1
}
