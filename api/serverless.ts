import express from "express";
import type { Router } from "express";
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

const createLazyRouter = (loader: () => Promise<Router>) => {
  let cachedRouter: Router | null = null;
  let pending: Promise<Router> | null = null;

  const resolveRouter = async () => {
    if (cachedRouter) {
      return cachedRouter;
    }
    if (!pending) {
      pending = loader().then((router) => {
        cachedRouter = router;
        pending = null;
        return router;
      });
    }
    return pending;
  };

  const wrapper = express.Router();
  wrapper.use(async (req, res, next) => {
    try {
      const router = await resolveRouter();
      router(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  return wrapper;
};

export const app = () => {
  ensureAgnicHome();
  logStorageStatus();
  const router = express();

  router.get("/api", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const walletRouter = createLazyRouter(async () => {
    const { createWalletApi } = await import("@agnicid/wallet-ui/server/api");
    return createWalletApi({
      sellerJobsPath: "/api/seller/jobs"
    });
  });

  const sellerRouter = createLazyRouter(async () => {
    const { createSellerService } = await import("@agnicid/service-seller");
    return createSellerService();
  });

  router.use("/api/wallet", walletRouter);
  router.use("/api/seller", sellerRouter);

  return router;
};

export default app();
