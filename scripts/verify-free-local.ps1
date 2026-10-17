# Free local checks; no cloud database access or paid runner.
# powershell -ExecutionPolicy Bypass -File scripts/verify-free-local.ps1
param([switch]$SkipBuild)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  $npm = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }
  $version = (& node -p "process.versions.node").Trim()
  if ([int]($version.Split(".")[0]) -lt 22) { throw "Node.js 22+ required, found $version" }
  # Switching Git branches can leave .next/dev/types referring to routes that no longer exist.
  # Clean ONLY generated build/typecheck output before verifying this checkout.
  if (Test-Path -LiteralPath ".next") {
    Write-Host "Removing stale Next.js generated artifacts" -ForegroundColor Cyan
    Remove-Item -LiteralPath ".next" -Recurse -Force
  }
  if (Test-Path -LiteralPath "tsconfig.tsbuildinfo") {
    Remove-Item -LiteralPath "tsconfig.tsbuildinfo" -Force
  }
  $tasks = @(
    @{Label="npm ci"; Cmd=@("ci")},
    @{Label="TypeScript"; Cmd=@("exec","--","tsc","--noEmit")},
    @{Label="ESLint"; Cmd=@("run","lint")}
  )
  if (-not $SkipBuild) { $tasks += @{Label="Next.js Build";Cmd=@("run","build")} }
  $tasks += @{Label="Test dependencies";Cmd=@(
    "install","--no-save","--package-lock=false","--ignore-scripts",
    "@electric-sql/pglite@0.5.10","tsx@4.23.15")}
  foreach ($task in $tasks) {
    Write-Host ("Checking " + $task.Label) -ForegroundColor Cyan
    $arguments = [string[]]$task.Cmd
    & $npm @arguments
    if ($LASTEXITCODE -ne 0) { throw ("Failed: " + $task.Label) }
  }
  $tests = @(Get-ChildItem "tests" -Filter "*.test.ts" -File |
    Sort-Object Name | ForEach-Object { $_.FullName })
  if ($tests.Count -eq 0) { throw "No tests found" }
  & node --conditions=react-server --import tsx --test @tests
  if ($LASTEXITCODE -ne 0) { throw "Database/security tests FAILED" }
  Write-Host "ALL LOCAL CHECKS PASSED" -ForegroundColor Green
}
finally { Pop-Location }
