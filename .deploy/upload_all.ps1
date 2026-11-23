# Upload the deploy bundles from %TEMP% to /tmp on the server.
$tmp = $env:TEMP
$files = @("ps-cfo-src.tar.gz", "ps-cfo-data.tar.gz", "ps-cfo.env")
foreach ($f in $files) {
  & (Join-Path $PSScriptRoot "upload.ps1") (Join-Path $tmp $f) "/tmp/$f"
  if ($LASTEXITCODE -ne 0) { Write-Error "upload failed: $f"; exit 1 }
  Write-Output "uploaded $f"
}
