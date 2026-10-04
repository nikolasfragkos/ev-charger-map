#!/bin/bash

# Reset script - Simulates a fresh clone for testing setup.sh
# WARNING: This will delete all local data!

echo "This will reset everything to test the setup script!"
echo "   - Stop all services"
echo "   - Delete node_modules"
echo "   - Delete .env files"
echo "   - Delete Docker volumes (database data)"
echo "   - Delete generated Prisma client"
echo ""
read -p "Are you sure? (y/N): " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Cancelled."
    exit 0
fi

echo "Stopping Docker containers and removing volumes..."
docker compose down -v 2>/dev/null || true

echo "Removing backend node_modules, .env, and generated files..."
rm -rf back-end/node_modules
rm -f back-end/.env
rm -rf back-end/node_modules/.prisma 2>/dev/null

echo "Removing frontend node_modules, .env.local, and build cache..."
rm -rf front-end/node_modules
rm -rf front-end/.next
rm -f front-end/.env.local

echo "Removing CLI node_modules..."
rm -rf cli/node_modules 2>/dev/null
rm -rf cli-client/node_modules 2>/dev/null

echo ""
echo "Reset complete! Now run: ./setup.sh"
