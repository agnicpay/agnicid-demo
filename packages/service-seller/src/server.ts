import express from "express";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createSellerService } from "./sellerApp.js";

const PORT = parseInt(process.env.SELLER_PORT ?? "8081", 10);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*"
  }
});

app.use("/", createSellerService({ io }));

const start = () => {
  httpServer.listen(PORT, () => {
    console.log(`Seller listening on http://localhost:${PORT}`);
  });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { app };
export default httpServer;
