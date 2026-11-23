# Build the upload bundles in %TEMP%:
#   ps-cfo-src.tar.gz   committed source (git archive HEAD)
#   ps-cfo-data.tar.gz  consistent snapshot of data/ (see snapshot_data.cjs)
#   ps-cfo.env          .env without SERVER_PASSWORD
Set-Location (Join-Path $PSScriptRoot "..")
$tmp = $env:TEMP
git archive --format=tar.gz -o (Join-Path $tmp "ps-cfo-src.tar.gz") HEAD
node .deploy/snapshot_data.cjs | Out-Null
tar -czf (Join-Path $tmp "ps-cfo-data.tar.gz") -C (Join-Path $tmp "ps-cfo-data") .
Get-Content .env | Where-Object { $_ -notmatch '^SERVER_PASSWORD=' } | Set-Content (Join-Path $tmp "ps-cfo.env")
Get-ChildItem (Join-Path $tmp "ps-cfo-*"), (Join-Path $tmp "ps-cfo.env") | Select-Object Name, Length | Format-Table -AutoSize | Out-String | Write-Output
