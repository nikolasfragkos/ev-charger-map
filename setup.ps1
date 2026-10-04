# EV Charger App - Development Setup Script (Windows PowerShell)
# This script sets up the development environment for a new developer

$ErrorActionPreference = "Stop"

if ([console]::InputEncoding -ne [System.Text.Encoding]::UTF8) {
    [console]::InputEncoding = [System.Text.Encoding]::UTF8
    [console]::OutputEncoding = [System.Text.Encoding]::UTF8
}

Write-Host "`nEV Charger App - Development Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# -----------------------------------------------------------------------------
# Detect LAN IP (for phone access)
# -----------------------------------------------------------------------------
$LAN_IP = "localhost"
try {
    $netAdapter = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*","Ethernet*" -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "169.*" -and $_.IPAddress -ne "127.0.0.1" } |
        Select-Object -First 1
    if ($netAdapter) {
        $LAN_IP = $netAdapter.IPAddress
        Write-Host "Detected LAN IP: $LAN_IP (phone can connect via this IP)" -ForegroundColor Green
    } else {
        Write-Host "Could not detect LAN IP. Using localhost (phone access won't work)." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not detect LAN IP. Using localhost." -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
# 1. Check Docker
# -----------------------------------------------------------------------------
Write-Host "`n[1/7] Checking Docker..." -ForegroundColor Yellow
try {
    $originalErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    docker version > $null 2>&1
    $dockerRunning = $?
    $ErrorActionPreference = $originalErrorAction

    if ($dockerRunning) {
        Write-Host "Docker is running." -ForegroundColor Green
    } else {
        throw "Docker not responding"
    }
} catch {
    Write-Host "Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# -----------------------------------------------------------------------------
# 2. Start Containers
# -----------------------------------------------------------------------------
Write-Host "`n[2/7] Starting Postgres and Redis..." -ForegroundColor Yellow
try {
    $ErrorActionPreference = "SilentlyContinue"
    docker compose up -d --wait 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"
} catch {
    Write-Host "Proceeding despite Docker warnings..." -ForegroundColor Gray
}

# Verify Postgres is up
Write-Host "       Verifying Database connectivity..." -ForegroundColor Gray
$attempts = 0
$dbReady = $false

do {
    $attempts++
    Start-Sleep -Seconds 2

    try {
        $ErrorActionPreference = "SilentlyContinue"
        docker compose exec -T postgres pg_isready -U user -d ev_app > $null 2>&1
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = "Stop"

        if ($exitCode -eq 0) {
            $dbReady = $true
            break
        }
    } catch {
        # Ignore, retry
    }

    Write-Host "       ...waiting for Postgres ($attempts/15)"
} while ($attempts -lt 15)

if (-not $dbReady) {
    Write-Host "Database did not become ready. Try 'docker compose up' manually." -ForegroundColor Red
    exit 1
}
Write-Host "Database is ready." -ForegroundColor Green

# -----------------------------------------------------------------------------
# 3. Backend Setup
# -----------------------------------------------------------------------------
Write-Host "`n[3/7] Setting up Backend..." -ForegroundColor Yellow
if (Test-Path "back-end") {
    Push-Location back-end
    try {
        Write-Host "       Installing dependencies..."
        npm install --silent | Out-Null
        Write-Host "Dependencies installed." -ForegroundColor Green

        if (-not (Test-Path .env)) {
            Write-Host "       Creating .env file..."
            @"
DATABASE_URL=postgresql://user:pass@localhost:5432/ev_app
REDIS_URL=redis://localhost:6379
JWT_SECRET=supersecretkey
PORT=9876
ENTSOE_TOKEN=97d0b853-32c7-41c4-b819-f30869b35682
ENABLE_PRICING=1
STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_SECRET_KEY_HERE
"@ | Out-File -FilePath .env -Encoding UTF8 -NoNewline
            Write-Host "Backend .env created." -ForegroundColor Green
        } else {
            Write-Host "Backend .env already exists." -ForegroundColor Gray
        }

        Write-Host "       Generating Prisma client..."
        $null = cmd /c "npx prisma generate 2>&1"
        if ($LASTEXITCODE -ne 0) { throw "Prisma generate failed" }
        Write-Host "Prisma client generated." -ForegroundColor Green

        Write-Host "       Syncing database schema..."
        $null = cmd /c "npx prisma db push --accept-data-loss 2>&1"
        if ($LASTEXITCODE -ne 0) { throw "Prisma db push failed" }
        Write-Host "Database schema synced." -ForegroundColor Green

        Write-Host "       Seeding database (admin user + pricing profile)..."
        $null = cmd /c "npx prisma db seed 2>&1"
        if ($LASTEXITCODE -ne 0) { throw "Prisma seed failed" }
        Write-Host "Database seeded." -ForegroundColor Green

        Write-Host "       Seeding car catalog..."
        $null = cmd /c "npx tsx src/scripts/seedCars.ts 2>&1"
        if ($LASTEXITCODE -ne 0) { throw "Car catalog seeding failed" }
        Write-Host "Car catalog seeded." -ForegroundColor Green

    } catch {
        Write-Host "Backend setup failed: $_" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
} else {
    Write-Host "'back-end' folder not found!" -ForegroundColor Red
    exit 1
}

# -----------------------------------------------------------------------------
# 4. Frontend Setup
# -----------------------------------------------------------------------------
Write-Host "`n[4/7] Setting up Frontend..." -ForegroundColor Yellow
if (Test-Path "front-end") {
    Push-Location front-end
    try {
        Write-Host "       Installing dependencies..."
        npm install --silent | Out-Null
        Write-Host "Dependencies installed." -ForegroundColor Green

        if (-not (Test-Path .env.local)) {
            Write-Host "       Creating .env.local (API URL: http://${LAN_IP}:9876)..."
            @"
NEXT_PUBLIC_API_URL=http://${LAN_IP}:9876/api/v1
NEXT_PUBLIC_WEB3FORMS_KEY=d8086a1c-b517-4ada-b228-856ac4495cff
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51SoNW7Qo2CKKZoiNZPjJfkzPgvWeNPdyvuksD992vPJmR5lKSkZ7m6y4bWOxBSwO2nikVY1PyFN3F4W1kxhYXVJW00DH3CBRwO
NEXT_PUBLIC_ENABLE_MOCK_SESSION=0
"@ | Out-File -FilePath .env.local -Encoding UTF8 -NoNewline
            Write-Host "Frontend .env.local created." -ForegroundColor Green
        } else {
            Write-Host "Frontend .env.local already exists." -ForegroundColor Gray
        }
    } catch {
        Write-Host "Frontend setup issue: $_" -ForegroundColor DarkYellow
    }
    Pop-Location
} else {
    Write-Host "'front-end' folder not found. Skipping." -ForegroundColor DarkYellow
}

# -----------------------------------------------------------------------------
# 5. CLI Setup
# -----------------------------------------------------------------------------
Write-Host "`n[5/7] Setting up CLI Tool..." -ForegroundColor Yellow
$cliPath = ""
if (Test-Path "cli-client") { $cliPath = "cli-client" } elseif (Test-Path "cli") { $cliPath = "cli" }

if ($cliPath) {
    Push-Location $cliPath
    try {
        Write-Host "       Installing CLI dependencies..."
        npm install --silent | Out-Null
        npm link 2>&1 | Out-Null
        Write-Host "CLI installed. You can use 'se2502' command." -ForegroundColor Green
    } catch {
        Write-Host "CLI setup warning (ignoring)." -ForegroundColor DarkYellow
    }
    Pop-Location
} else {
    Write-Host "CLI folder not found. Skipping." -ForegroundColor DarkYellow
}

# -----------------------------------------------------------------------------
# 6. Load demo charger data
# -----------------------------------------------------------------------------
Write-Host "`n[6/7] Loading demo charger data..." -ForegroundColor Yellow
Push-Location back-end
try {
    # Start backend in background
    $backendJob = Start-Job -ScriptBlock {
        Set-Location $using:PWD
        npm run dev 2>&1
    }

    # Wait for backend to be ready
    $attempts = 0
    $ready = $false
    do {
        Start-Sleep -Seconds 2
        $attempts++
        try {
            $ErrorActionPreference = "SilentlyContinue"
            $response = Invoke-WebRequest -Uri "http://localhost:9876/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            $ErrorActionPreference = "Stop"
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Write-Host "       Waiting for backend ($attempts/15)..."
    } while ($attempts -lt 15)

    if ($ready) {
        # Login as admin
        $loginBody = '{"email":"admin@ev.local","password":"admin123"}'
        $loginResponse = Invoke-RestMethod -Uri "http://localhost:9876/api/v1/auth/signin" -Method Post -ContentType "application/json" -Body $loginBody -ErrorAction SilentlyContinue
        $token = $loginResponse.token

        if ($token) {
            # Load demo chargers
            $headers = @{ "Authorization" = "Bearer $token" }
            $result = Invoke-RestMethod -Uri "http://localhost:9876/api/v1/admin/resetpoints" -Method Post -Headers $headers -ErrorAction SilentlyContinue
            Write-Host "Demo chargers loaded." -ForegroundColor Green
        } else {
            Write-Host "Could not authenticate. Load demo data manually." -ForegroundColor Yellow
        }
    } else {
        Write-Host "Backend did not start in time. Load demo data manually." -ForegroundColor Yellow
    }

    # Stop the background backend
    Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $backendJob -Force -ErrorAction SilentlyContinue
} catch {
    Write-Host "Demo data loading issue: $_" -ForegroundColor DarkYellow
}
Pop-Location

# -----------------------------------------------------------------------------
# 7. Summary
# -----------------------------------------------------------------------------
Write-Host "`n======================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Default admin credentials:"
Write-Host "  Email:    admin@ev.local"
Write-Host "  Password: admin123"
Write-Host ""
Write-Host "To start the app, run in separate terminals:" -ForegroundColor White
Write-Host ""
Write-Host "  Terminal 1 (Backend):" -ForegroundColor Cyan
Write-Host "    cd back-end; npm run dev"
Write-Host ""
Write-Host "  Terminal 2 (Frontend):" -ForegroundColor Cyan
Write-Host "    cd front-end; npm run dev"
Write-Host ""
Write-Host "  Access from this PC:  http://localhost:3000"
if ($LAN_IP -ne "localhost") {
    Write-Host "  Access from phone:    http://${LAN_IP}:3000"
}
Write-Host ""
Write-Host "  Backend API:          http://localhost:9876/api/v1"
Write-Host ""
Write-Host ""
Write-Host "  Terminal 3 : Initialize Data (IMPORTANT)" -ForegroundColor Cyan
Write-Host "   (Ensure Backend is running first)"
Write-Host "   se2502 login --username admin@ev.local --passw admin123"
Write-Host "   se2502 resetpoints"
Write-Host ""
