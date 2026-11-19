<#
.SYNOPSIS
  Construit la solution Dynamics XSLT_Patch (wrapper Windows de scripts/build.mjs).

.EXAMPLE
  .\scripts\build.ps1                      # cibles 8.2 et 9.2
  .\scripts\build.ps1 -Target 8.2
  .\scripts\build.ps1 -Version 1.0.1.0 -NoMinify
#>
[CmdletBinding()]
param(
  [ValidateSet('8.2', '9.2')]
  [string[]] $Target,
  [string] $Version,
  [switch] $NoMinify,
  [switch] $Check
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js 18+ requis (https://nodejs.org).'
}
if (-not (Test-Path (Join-Path $root 'node_modules/terser'))) {
  Push-Location $root
  try { npm install --no-audit --no-fund } finally { Pop-Location }
}

$argsList = @((Join-Path $root 'scripts/build.mjs'))
foreach ($t in $Target) { $argsList += @('--target', $t) }
if ($Version) { $argsList += @('--version', $Version) }
if ($NoMinify) { $argsList += '--no-minify' }
if ($Check) { $argsList += '--check' }

& node @argsList
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
