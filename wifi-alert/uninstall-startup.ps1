# Stops starting the Iris Wi-Fi alert at login (removes the Startup shortcut
# that install-startup.ps1 added). A copy already running keeps running until
# you sign out or restart.
#
#   powershell -ExecutionPolicy Bypass -File uninstall-startup.ps1

$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'Iris Wi-Fi alert.lnk'
if (Test-Path $link) {
    Remove-Item $link
    Write-Host "Removed from startup: $link"
} else {
    Write-Host 'It was not set to start at login.'
}
