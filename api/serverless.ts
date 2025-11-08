import express from "express";
import serverlessHttp from "serverless-http";
import { createSellerService } from "@agnicid/service-seller";
import { createWalletApi } from "@agnicid/wallet-ui/server/api";

const ensureAgnicHome = () => {
  if (!process.env.AGNIC_ID_HOME) {
    process.env.AGNIC_ID_HOME = "/tmp/.agnicid";
  }
};

export const app = () => {
  ensureAgnicHome();
  const router = express();

  router.get(["/api", "/api/health"], (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  router.use(
    "/api/wallet",
    createWalletApi({
      sellerJobsPath: "/api/seller/jobs"
    })
  );

  router.use(
    "/api/seller",
    createSellerService()
  );

  return router;
};

const handler = serverlessHttp(app());

export default handler;
