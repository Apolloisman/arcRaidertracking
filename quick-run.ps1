# Quick launcher for loot run generator (PowerShell)
# Usage: Right-click -> Run with PowerShell, or run from terminal

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ARC RAIDERS LOOT RUN GENERATOR" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$map = Read-Host "Enter map name (dam/spaceport/buried-city/blue-gate)"
if ([string]::IsNullOrWhiteSpace($map)) {
    Write-Host "No map specified, using 'dam' as default" -ForegroundColor Yellow
    $map = "dam"
}

$coords = Read-Host "Enter your spawn coordinates (x y) or press Enter to use saved spawn"

if ([string]::IsNullOrWhiteSpace($coords)) {
    Write-Host "Using saved spawn coordinates..." -ForegroundColor Green
    node run-loot.cjs $map
} else {
    $parts = $coords -split '\s+'
    if ($parts.Length -ge 2) {
        node run-loot.cjs $map $parts[0] $parts[1]
    } else {
        Write-Host "Invalid coordinates format. Use: x y" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

