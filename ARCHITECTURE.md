# Agnic.ID Path-Based Architecture

This setup uses a single port (3000) with different paths for different services, instead of multiple ports.

## 🚀 Quick Start

```bash
npm run dev
```

This starts all services and the main proxy server. Access everything at:
**http://localhost:3000**

## 📍 Service Endpoints

| Service | Path | Description |
|---------|------|-------------|
| **Frontend** | `/` | React application (Vite dev server) |
| **Wallet API** | `/api/wallet/*` | User profile, credentials, keys |
| **Seller API** | `/api/seller/*` | Jobs, payments, verification |
| **Health Check** | `/health` | System status |

## 🔄 How It Works

1. **Main Server** (port 3000) acts as a reverse proxy
2. **Backend Services** run on internal ports:
   - Frontend: localhost:5173 (Vite)
   - Wallet API: localhost:8787 
   - Seller API: localhost:8081
3. **Requests are routed** by path:
   - `/api/wallet/*` → localhost:8787
   - `/api/seller/*` → localhost:8081
   - Everything else → localhost:5173 (frontend)

## 🛠️ Development Commands

```bash
# Start everything (recommended)
npm run dev

# Start individual services
npm run dev:frontend      # Vite dev server only
npm run dev:wallet-api    # Wallet API server only  
npm run dev:seller        # Seller API server only
npm run dev:main-server   # Main proxy server only
```

## 🔧 Configuration

- Frontend config: `packages/wallet-ui/src/config.ts`
- Main server: `packages/main-server/src/server.ts`
- API base URLs now use relative paths (`/api/wallet`, `/api/seller`)

## ✅ Benefits

1. **Single URL** - Everything accessible at localhost:3000
2. **No CORS issues** - Same origin for all requests
3. **Production ready** - Easy to deploy behind nginx/cloudflare
4. **Better DX** - No port management needed
5. **Realistic setup** - Matches real-world deployment patterns