import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "node:path";
import fs from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Server as SocketIOServer } from "socket.io";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createSellerService } from "@agnicid/service-seller";
import { createWalletApi } from "@agnicid/wallet-ui/server/api";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const FRONTEND_DIST = process.env.FRONTEND_DIST ?? path.resolve(__dirname, "..", "..", "wallet-ui", "dist");
const FRONTEND_DEV_SERVER = process.env.FRONTEND_DEV_SERVER;
const SELLER_JOBS_URL = process.env.SELLER_JOBS_URL;

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

app.use(morgan("combined"));
app.use(cors());

const isApiRoute = (pathname: string) => pathname.startsWith("/api") || pathname.startsWith("/health");

app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    routes: {
      wallet: "/api/wallet",
      seller: "/api/seller",
      frontend: "/"
    },
    frontend: FRONTEND_DEV_SERVER
      ? { mode: "proxy", target: FRONTEND_DEV_SERVER }
      : { mode: "static", dist: FRONTEND_DIST }
  });
});

app.use(
  "/api/wallet",
  createWalletApi({
    sellerJobsPath: "/api/seller/jobs",
    defaultJobsUrl: SELLER_JOBS_URL
  })
);

app.use("/api/seller", createSellerService({ io }));

if (FRONTEND_DEV_SERVER) {
  const frontendProxy = createProxyMiddleware({
    target: FRONTEND_DEV_SERVER,
    changeOrigin: true,
    ws: true,
    logLevel: "warn"
  });

  app.use((req, res, next) => {
    if (isApiRoute(req.path)) {
      return next();
    }
    return frontendProxy(req, res, next);
  });

  if (frontendProxy.upgrade) {
    httpServer.on("upgrade", frontendProxy.upgrade);
  }
} else {
  if (!fs.existsSync(FRONTEND_DIST)) {
    console.warn(`⚠️  Frontend dist directory not found at ${FRONTEND_DIST}`);
  }
  app.use(express.static(FRONTEND_DIST));
  app.get("*", (req, res, next) => {
    if (isApiRoute(req.path)) {
      return next();
    }
    return res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
}

app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? err.message : "Something went wrong"
    });
  }
);

const server = httpServer.listen(PORT, () => {
  console.log(`🚀 Agnic.ID Main Server running on http://localhost:${PORT}`);
  console.log("");
  console.log("📍 Available endpoints:");
  console.log(`   🌐 Frontend:    http://localhost:${PORT}/`);
  console.log(`   🔧 Wallet API:  http://localhost:${PORT}/api/wallet/`);
  console.log(`   🏪 Seller API:  http://localhost:${PORT}/api/seller/`);
  console.log(`   ❤️  Health:     http://localhost:${PORT}/health`);
  console.log("");
  console.log("🧬 Frontend mode:", FRONTEND_DEV_SERVER ? `proxy => ${FRONTEND_DEV_SERVER}` : `static => ${FRONTEND_DIST}`);
});

const gracefulShutdown = (signal: NodeJS.Signals) => {
  console.log(`🛑 Received ${signal}, shutting down gracefully`);
  server.close(() => {
    io.close(() => {
      console.log("✅ Server closed");
      process.exit(0);
    });
  });
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

export default app;
