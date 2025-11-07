#!/bin/bash

# Agnic.ID Development Environment Starter
# This script starts all required services for development

echo "🚀 Starting Agnic.ID Development Environment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${YELLOW}⚠️  Port $1 is already in use${NC}"
        return 1
    else
        return 0
    fi
}

# Check required ports
echo "📋 Checking required ports..."
check_port 5173 || echo "   Frontend (Vite) - Port 5173"
check_port 8787 || echo "   Wallet API - Port 8787"  
check_port 8081 || echo "   Service Seller - Port 8081"
echo ""

# Install dependencies if needed
echo "📦 Ensuring dependencies are installed..."
npm install
echo ""

echo -e "${BLUE}🎯 Starting services...${NC}"
echo ""

# Start services in background
echo -e "${GREEN}1. Starting Service Seller (Port 8081)...${NC}"
npm run dev --workspace @agnicid/service-seller &
SELLER_PID=$!

echo -e "${GREEN}2. Starting Wallet UI (Frontend: 5173, API: 8787)...${NC}"  
npm run dev --workspace @agnicid/wallet-ui &
WALLET_PID=$!

# Wait a moment for services to start
sleep 3

echo ""
echo -e "${GREEN}✅ Services started successfully!${NC}"
echo ""
echo -e "${BLUE}📱 Access your applications:${NC}"
echo "   🌐 Wallet UI:      http://localhost:5173"
echo "   🔧 Wallet API:     http://localhost:8787"  
echo "   🏪 Service Seller: http://localhost:8081"
echo ""
echo -e "${YELLOW}📝 To stop all services: Press Ctrl+C${NC}"
echo ""

# Wait for user interrupt
wait

# Cleanup
echo ""
echo "🛑 Stopping services..."
kill $SELLER_PID $WALLET_PID 2>/dev/null
echo "✅ All services stopped."