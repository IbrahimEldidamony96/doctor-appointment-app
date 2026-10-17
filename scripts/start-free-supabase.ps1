# Local-only Supabase with Docker; DO NOT link to your production project.
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw "Start a free Docker-compatible container engine." }
  if (-not (Test-Path "supabase/config.toml")) {
    & npx --yes supabase init
    if ($LASTEXITCODE -ne 0) { throw "Failed to initialize local Supabase." }
  }
  $path = "supabase/config.toml"
  $config = Get-Content $path -Raw
  if ($config -match '(?m)^schemas\s*=\s*\[[^\r\n]*\]') {
    $config = [regex]::Replace($config,'(?m)^schemas\s*=\s*\[[^\r\n]*\]','schemas = ["public", "graphql_public", "clinic"]')
    Set-Content $path $config -Encoding UTF8
  }
  & npx --yes supabase start
  if ($LASTEXITCODE -ne 0) { throw "Local Supabase failed." }
  Write-Host "Use LOCAL keys from: npx supabase status" -ForegroundColor Green
  Write-Host "Stop with: npx supabase stop"
}
finally { Pop-Location }
