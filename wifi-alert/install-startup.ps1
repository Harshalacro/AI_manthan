# Starts the Iris Wi-Fi alert at every Windows login, hidden, by putting a
# shortcut to start-hidden.vbs in your Startup folder (this user only), and
# starts it now. Run it yourself, once:
#
#   powershell -ExecutionPolicy Bypass -File install-startup.ps1
#
# Undo with uninstall-startup.ps1.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $here 'start-hidden.vbs'
$pythonw = Join-Path $here '.venv\Scripts\pythonw.exe'
if (-not (Test-Path $pythonw)) {
    Write-Host 'Set up the Wi-Fi alert first:' -ForegroundColor Yellow
    Write-Host '  python -m venv .venv'
    Write-Host '  .venv\Scripts\python -m pip install -r requirements.txt'
    exit 1
}

$startup = [Environment]::GetFolderPath('Startup')
$link = Join-Path $startup 'Iris Wi-Fi alert.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '"' + $launcher + '"'
$shortcut.WorkingDirectory = $here
$shortcut.Description = 'Iris Wi-Fi alert: waits for the Broadcast button'
$shortcut.Save()
Write-Host "Added to startup: $link"

# Start it now too, unless it is already running.
try {
    Invoke-RestMethod -Uri 'http://localhost:8091/api/status' -TimeoutSec 2 | Out-Null
    Write-Host 'Already running at http://localhost:8091'
} catch {
    Start-Process -FilePath (Join-Path $env:WINDIR 'System32\wscript.exe') -ArgumentList ('"' + $launcher + '"')
    Start-Sleep -Seconds 4
    try {
        Invoke-RestMethod -Uri 'http://localhost:8091/api/status' -TimeoutSec 5 | Out-Null
        Write-Host 'Running now at http://localhost:8091. The site''s Broadcast button will work.' -ForegroundColor Green
    } catch {
        Write-Host "Started, but it is not answering yet. See $(Join-Path $here 'wifi_alert.log')" -ForegroundColor Yellow
    }
}
