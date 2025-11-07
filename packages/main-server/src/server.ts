import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(morgan('combined'));
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      wallet: 'http://localhost:8787',
      seller: 'http://localhost:8081',
      frontend: 'http://localhost:5173'
    }
  });
});

// API Routes - Proxy to backend services
const walletProxy = createProxyMiddleware({
  target: 'http://localhost:8787',
  changeOrigin: true,
  pathRewrite: {
    '^/api/wallet': '', // Remove /api/wallet prefix when forwarding
  },
  onError: (err, req, res) => {
    console.error('Wallet API Proxy Error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ 
        error: 'Wallet API unavailable',
        message: 'The wallet service is not responding'
      });
    }
  },
  onProxyReq: (_proxyReq, req) => {
    console.log(`[Wallet API] ${req.method ?? 'UNKNOWN'} ${req.url ?? ''}`);
  }
});

const sellerProxy = createProxyMiddleware({
  target: 'http://localhost:8081',
  changeOrigin: true,
  pathRewrite: {
    '^/api/seller': '', // Remove /api/seller prefix when forwarding
  },
  onError: (err, req, res) => {
    console.error('Seller API Proxy Error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ 
        error: 'Seller API unavailable',
        message: 'The seller service is not responding'
      });
    }
  },
  onProxyReq: (_proxyReq, req) => {
    console.log(`[Seller API] ${req.method ?? 'UNKNOWN'} ${req.url ?? ''}`);
  }
});

// Frontend proxy - serves the Vite dev server
const frontendProxy = createProxyMiddleware({
  target: 'http://localhost:5173',
  changeOrigin: true,
  ws: true, // Enable websocket proxy for HMR
  onError: (err, req, res) => {
    console.error('Frontend Proxy Error:', err.message);
    if (!res.headersSent) {
      res.status(502).send(`
        <html>
          <head><title>Frontend Unavailable</title></head>
          <body>
            <h1>Frontend Service Unavailable</h1>
            <p>The frontend development server is not running.</p>
            <p>Please start it with: <code>npm run dev:frontend</code></p>
          </body>
        </html>
      `);
    }
  }
});

// Apply proxies
app.use('/api/wallet', walletProxy);
app.use('/api/seller', sellerProxy);

// Serve frontend for all other routes (SPA fallback)
app.use('/', frontendProxy);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Agnic.ID Main Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('📍 Available endpoints:');
  console.log(`   🌐 Frontend:    http://localhost:${PORT}/`);
  console.log(`   🔧 Wallet API:  http://localhost:${PORT}/api/wallet/`);
  console.log(`   🏪 Seller API:  http://localhost:${PORT}/api/seller/`);
  console.log(`   ❤️  Health:     http://localhost:${PORT}/health`);
  console.log('');
  console.log('🔄 Proxying to:');
  console.log('   Frontend: http://localhost:5173');
  console.log('   Wallet:   http://localhost:8787');
  console.log('   Seller:   http://localhost:8081');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;
