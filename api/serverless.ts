import express from "express";
import serverlessHttp from "serverless-http";
import { createSellerService } from "@agnicid/service-seller";
import { createWalletApi } from "@agnicid/wallet-ui/server/api";
import { getStorageDebugInfo, probeStorage } from "@agnicid/shared";

const ensureAgnicHome = () => {
  if (!process.env.AGNICID_HOME) {
    process.env.AGNICID_HOME = "/tmp/.agnicid";
  }
  if (!process.env.AGNICID_STORAGE) {
    process.env.AGNICID_STORAGE = "blob";
  }
};

let storageProbeLogged = false;
const logStorageStatus = () => {
  if (storageProbeLogged) {
    return;
  }
  storageProbeLogged = true;
  const info = getStorageDebugInfo();
  probeStorage()
    .then((ok) => {
      console.log(
        "[agnic] storage",
        JSON.stringify({
          mode: info.mode,
          storageEnv: info.storageEnv,
          blobPrefix: info.blobPrefix,
          agnicidHome: info.agnicidHome,
          hasBlobToken: info.hasBlobToken,
          probe: ok ? "ok" : "failed"
        })
      );
    })
    .catch((error) => {
      console.error("[agnic] storage probe failed", {
        info,
        error: (error as Error).message
      });
    });
};

export const app = () => {
  ensureAgnicHome();
  logStorageStatus();
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
