# Upload a local file to the deploy server using the password from .env (SERVER_PASSWORD).
# Usage: powershell -File .deploy/upload.ps1 "<local file>" "<remote path>"
param([Parameter(Mandatory=$true)][string]$Local, [Parameter(Mandatory=$true)][string]$Remote)
$envFile = Join-Path $PSScriptRoot "..\.env"
$line = Get-Content $envFile | Where-Object { $_ -match '^SERVER_PASSWORD=' } | Select-Object -First 1
if (-not $line) { Write-Error "SERVER_PASSWORD not found in .env"; exit 2 }
$pw = ($line -replace '^SERVER_PASSWORD=', '').Trim().Trim('"').Trim("'")
$pscp = "C:\Program Files\PuTTY\pscp.exe"
& $pscp -batch -pw $pw $Local "root@129.212.234.187:$Remote"
exit $LASTEXITCODE
