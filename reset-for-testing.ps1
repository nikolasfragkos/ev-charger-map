# EV Charger App - Reset Script (Windows PowerShell)
# Simulates a fresh clone for testing setup.ps1
# WARNING: This will delete all local data!

Write-Host "`nThis will reset everything to test the setup script!" -ForegroundColor Yellow
Write-Host "   - Stop all services"
Write-Host "   - Delete node_modules"
Write-Host "   - Delete .env files"
Write-Host "   - Delete Docker volumes (database data)"
Write-Host "   - Delete generated Prisma client"
Write-Host ""

$confirm = Read-Host "Are you sure? (y/N)"

if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "Cancelled."
    exit 0
}

Write-Host "Stopping Docker containers and removing volumes..." -ForegroundColor Yellow
docker compose down -v 2>$null

Write-Host "Removing backend node_modules, .env, and generated files..." -ForegroundColor Yellow
if (Test-Path "back-end\node_modules") { Remove-Item -Recurse -Force "back-end\node_modules" }
if (Test-Path "back-end\.env") { Remove-Item -Force "back-end\.env" }

Write-Host "Removing frontend node_modules, .env.local, and build cache..." -ForegroundColor Yellow
if (Test-Path "front-end\node_modules") { Remove-Item -Recurse -Force "front-end\node_modules" }
if (Test-Path "front-end\.next") { Remove-Item -Recurse -Force "front-end\.next" }
if (Test-Path "front-end\.env.local") { Remove-Item -Force "front-end\.env.local" }

Write-Host "Removing CLI node_modules..." -ForegroundColor Yellow
if (Test-Path "cli\node_modules") { Remove-Item -Recurse -Force "cli\node_modules" }
if (Test-Path "cli-client\node_modules") { Remove-Item -Recurse -Force "cli-client\node_modules" }

Write-Host "`nReset complete! Now run: .\setup.ps1" -ForegroundColor Green
