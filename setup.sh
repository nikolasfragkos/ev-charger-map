#!/bin/bash

# EV Charger App - Development Setup Script
# This script sets up the development environment for a new developer
# Works on macOS and Linux

set -e  # Exit on any error

echo "EV Charger App - Development Setup"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Detect LAN IP (for phone access)
# -----------------------------------------------------------------------------
detect_lan_ip() {
    local ip=""
    # macOS
    if command -v ipconfig &>/dev/null; then
        ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
    fi
    # Linux fallback
    if [ -z "$ip" ] && command -v hostname &>/dev/null; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
    fi
    # ip command fallback
    if [ -z "$ip" ] && command -v ip &>/dev/null; then
        ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' || true)
    fi
    echo "$ip"
}

LAN_IP=$(detect_lan_ip)
if [ -z "$LAN_IP" ]; then
    LAN_IP="localhost"
    echo -e "${YELLOW}Could not detect LAN IP. Using localhost (phone access won't work).${NC}"
else
    echo -e "${GREEN}Detected LAN IP: $LAN_IP (phone can connect via this IP)${NC}"
fi

# -----------------------------------------------------------------------------
# 1. Check Docker
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[1/7] Checking Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker is not running. Please start Docker Desktop and try again.${NC}"
    exit 1
fi
echo -e "${GREEN}Docker is running${NC}"

# -----------------------------------------------------------------------------
# 2. Start Docker containers (Postgres & Redis)
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[2/7] Starting Docker containers (Postgres & Redis)...${NC}"
docker compose up -d
echo -e "${GREEN}Docker containers started${NC}"

# Wait for Postgres to be ready
echo -e "${YELLOW}Waiting for Postgres to be ready...${NC}"
sleep 3
ATTEMPTS=0
until docker compose exec -T postgres pg_isready -U user -d ev_app > /dev/null 2>&1; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if [ $ATTEMPTS -ge 15 ]; then
        echo -e "${RED}Postgres did not become ready after 30s. Check 'docker compose logs postgres'.${NC}"
        exit 1
    fi
    echo "  Waiting for Postgres ($ATTEMPTS/15)..."
    sleep 2
done
echo -e "${GREEN}Postgres is ready${NC}"

# -----------------------------------------------------------------------------
# 3. Backend setup
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[3/7] Setting up Backend...${NC}"
cd back-end
npm install
echo -e "${GREEN}Backend dependencies installed${NC}"

# Create backend .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating backend .env file...${NC}"
    cat > .env << 'EOF'
DATABASE_URL=postgresql://user:pass@localhost:5432/ev_app
REDIS_URL=redis://localhost:6379
JWT_SECRET=supersecretkey
PORT=9876
ENTSOE_TOKEN=97d0b853-32c7-41c4-b819-f30869b35682
ENABLE_PRICING=1
STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_SECRET_KEY_HERE
EOF
    echo -e "${GREEN}Backend .env created${NC}"
else
    echo -e "${GREEN}Backend .env already exists${NC}"
fi

# Generate Prisma client
echo -e "${YELLOW}Generating Prisma client...${NC}"
npx prisma generate
echo -e "${GREEN}Prisma client generated${NC}"

# Sync database schema
echo -e "${YELLOW}Syncing database schema...${NC}"
npx prisma db push --accept-data-loss
echo -e "${GREEN}Database schema synced${NC}"

# Seed the database (creates admin user + initial chargers)
echo -e "${YELLOW}Seeding database (admin user + pricing profile)...${NC}"
npx prisma db seed
echo -e "${GREEN}Database seeded${NC}"

# Seed car catalog from CSV
echo -e "${YELLOW}Seeding car catalog...${NC}"
npx tsx src/scripts/seedCars.ts
echo -e "${GREEN}Car catalog seeded${NC}"

cd ..

# -----------------------------------------------------------------------------
# 4. Frontend setup
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[4/7] Setting up Frontend...${NC}"
cd front-end
npm install
echo -e "${GREEN}Frontend dependencies installed${NC}"

# Create frontend .env.local with detected LAN IP
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}Creating frontend .env.local (API URL: http://$LAN_IP:9876)...${NC}"
    cat > .env.local << EOF
NEXT_PUBLIC_API_URL=http://$LAN_IP:9876/api/v1
NEXT_PUBLIC_WEB3FORMS_KEY=d8086a1c-b517-4ada-b228-856ac4495cff
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51SoNW7Qo2CKKZoiNZPjJfkzPgvWeNPdyvuksD992vPJmR5lKSkZ7m6y4bWOxBSwO2nikVY1PyFN3F4W1kxhYXVJW00DH3CBRwO
NEXT_PUBLIC_ENABLE_MOCK_SESSION=0
EOF
    echo -e "${GREEN}Frontend .env.local created${NC}"
else
    echo -e "${GREEN}Frontend .env.local already exists${NC}"
fi

cd ..

# -----------------------------------------------------------------------------
# 5. CLI setup
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[5/7] Setting up CLI tool...${NC}"
if [ -d "cli-client" ]; then
    cd cli-client
    npm install
    npm link 2>/dev/null || true
    echo -e "${GREEN}CLI installed. You can use 'se2502' command.${NC}"
    cd ..
elif [ -d "cli" ]; then
    cd cli
    npm install
    npm link 2>/dev/null || true
    echo -e "${GREEN}CLI installed. You can use 'se2502' command.${NC}"
    cd ..
else
    echo -e "${YELLOW}CLI folder not found. Skipping CLI setup.${NC}"
fi

# -----------------------------------------------------------------------------
# 6. Load demo charger data (requires backend running temporarily)
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[6/7] Loading demo charger data...${NC}"
cd back-end
npm run dev &
BACKEND_PID=$!

# Wait for backend to be ready
echo -e "${YELLOW}Waiting for backend to start...${NC}"
ATTEMPTS=0
BACKEND_READY=false
until curl -s http://localhost:9876/api/health > /dev/null 2>&1; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if [ $ATTEMPTS -ge 15 ]; then
        echo -e "${YELLOW}Backend did not start in time. You can load demo data manually later.${NC}"
        kill $BACKEND_PID 2>/dev/null || true
        cd ..
        break
    fi
    sleep 2
done

if curl -s http://localhost:9876/api/health > /dev/null 2>&1; then
    BACKEND_READY=true
    # Login as admin
    TOKEN=$(curl -s -X POST http://localhost:9876/api/v1/auth/signin \
        -H "Content-Type: application/json" \
        -d '{"email":"admin@ev.local","password":"admin123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

    if [ -n "$TOKEN" ]; then
        # Load demo chargers from demo-chargers.json
        RESULT=$(curl -s -X POST http://localhost:9876/api/v1/admin/resetpoints \
            -H "Authorization: Bearer $TOKEN")
        echo -e "${GREEN}Demo chargers loaded${NC}"
    else
        echo -e "${YELLOW}Could not authenticate. Load demo data manually after starting the backend.${NC}"
    fi

    # Stop the temporary backend
    kill $BACKEND_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
    cd ..
fi

# -----------------------------------------------------------------------------
# 7. Summary
# -----------------------------------------------------------------------------
echo -e "\n${GREEN}======================================"
echo "  SETUP COMPLETE!"
echo "======================================${NC}"
echo ""
echo "Default admin credentials:"
echo "  Email:    admin@ev.local"
echo "  Password: admin123"
echo ""
echo "To start the app, run in separate terminals:"
echo ""
echo "  Terminal 1 (Backend):"
echo "    cd back-end && npm run dev"
echo ""
echo "  Terminal 2 (Frontend):"
echo "    cd front-end && npm run dev"
echo ""
echo "  Access from this PC:  http://localhost:3000"
if [ "$LAN_IP" != "localhost" ]; then
    echo "  Access from phone:    http://$LAN_IP:3000"
fi
echo ""
echo "  Backend API:          http://localhost:9876/api/v1"
echo ""
echo ""
echo "  Terminal 3 : Initialize Data (IMPORTANT)"
echo "   (Ensure Backend is running first)"
echo "   se2502 login --username admin@ev.local --passw admin123"
echo "   se2502 resetpoints"
echo ""