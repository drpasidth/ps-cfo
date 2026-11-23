# Run a remote command on the deploy server with the password from .env (SERVER_PASSWORD).
# Usage: powershell -File .deploy/ssh_run.ps1 "<remote command>"
param([Parameter(Mandatory=$true)][string]$Remote)
$envFile = Join-Path $PSScriptRoot "..\.env"
$line = Get-Content $envFile | Where-Object { $_ -match '^SERVER_PASSWORD=' } | Select-Object -First 1
if (-not $line) { Write-Error "SERVER_PASSWORD not found in .env"; exit 2 }
$pw = ($line -replace '^SERVER_PASSWORD=', '').Trim().Trim('"').Trim("'")
$plink = "C:\Program Files\PuTTY\plink.exe"
& $plink -ssh -batch -pw $pw root@129.212.234.187 $Remote
exit $LASTEXITCODE
