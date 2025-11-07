import express from "express";
import { createWalletApi } from "./createWalletApi.js";
const PORT = parseInt(process.env.WALLET_API_PORT ?? "8787", 10);
export const createWalletServer = () => {
    const app = express();
    app.use("/", createWalletApi({
        defaultJobsUrl: process.env.WALLET_DEFAULT_JOBS_URL ?? "http://localhost:8081/jobs"
    }));
    return app;
};
const start = () => {
    const app = createWalletServer();
    app.listen(PORT, () => {
        console.log(`Wallet API listening on http://localhost:${PORT}`);
    });
};
if (import.meta.url === `file://${process.argv[1]}`) {
    start();
}
export { createWalletApi } from "./createWalletApi.js";
