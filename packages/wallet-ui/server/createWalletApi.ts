import express from "express";
import cors from "cors";
import path from "node:path";
import AdmZip from "adm-zip";
import { listStoredCredentials, executeX402Flow } from "@agnicid/agent-sdk";
import type { AgentEvent } from "@agnicid/agent-sdk";
import type { KeyAlias } from "@agnicid/issuer-cli";
import {
  AGNIC_ID_HOME,
  ensureStore,
  ensureDid,
  ensureKeypair,
  issueAgeCredential,
  issueDelegationCredential,
  issueEmailCredential,
  KEY_ALIASES,
  resolveStorePath
} from "@agnicid/issuer-cli";
import { listFilesRecursive, pathExists as storagePathExists, readFile as storageReadFile } from "@agnicid/shared";

export interface WalletApiOptions {
  /**
   * Absolute URL that the agent flow should call to reach the seller service.
   * Used as a fallback when the incoming request doesn't specify a jobs URL.
   */
  defaultJobsUrl?: string;
  /**
   * Relative path (e.g. `/api/seller/jobs`) that will be combined with the
   * incoming request's host to form an absolute URL for the seller jobs endpoint.
   */
  sellerJobsPath?: string;
}

export const createWalletApi = (options: WalletApiOptions = {}) => {
  const router = express.Router();

  router.use(cors());
  router.use(express.json());

  const asyncHandler =
    (fn: express.RequestHandler): express.RequestHandler =>
    (req, res, next) =>
      Promise.resolve(fn(req, res, next)).catch(next);

  router.get(
    "/health",
    asyncHandler(async (_req, res) => {
      await ensureStore();
      res.json({ status: "ok", home: AGNIC_ID_HOME });
    })
  );

  router.get(
    "/status",
    asyncHandler(async (_req, res) => {
      await ensureStore();
      const keys = await Promise.all(
        KEY_ALIASES.map(async (alias: KeyAlias) => ({
          alias,
          exists: await pathExists(resolveStorePath("keys", `${alias}.key.json`))
        }))
      );
      const dids = await Promise.all(
        KEY_ALIASES.map(async (alias: KeyAlias) => {
          const doc = await ensureDid(alias);
          return { alias, did: doc.id };
        })
      );
      const credentials = await listStoredCredentials();
      res.json({
        home: AGNIC_ID_HOME,
        keys,
        dids,
        credentials
      });
    })
  );

  router.get(
    "/credentials",
    asyncHandler(async (_req, res) => {
      await ensureStore();
      const credentials = await listStoredCredentials();
      res.json(credentials);
    })
  );

  router.post(
    "/credentials/email",
    asyncHandler(async (req, res) => {
      const { email, emailVerified = true } = req.body as {
        email?: string;
        emailVerified?: boolean;
      };
      if (!email) {
        return res.status(400).json({ error: "email is required" });
      }
      await ensureStore();
      const humanDid = await ensureDid("human");
      const result = await issueEmailCredential({
        subjectDid: humanDid.id,
        email,
        emailVerified
      });
      res.json(result.stored);
    })
  );

  router.post(
    "/credentials/age",
    asyncHandler(async (req, res) => {
      const { birthDate } = req.body as { birthDate?: string };
      if (!birthDate) {
        return res.status(400).json({ error: "birthDate is required" });
      }
      await ensureStore();
      const humanDid = await ensureDid("human");
      const result = await issueAgeCredential({
        subjectDid: humanDid.id,
        birthDate
      });
      res.json(result.stored);
    })
  );

  router.post(
    "/credentials/delegation",
    asyncHandler(async (req, res) => {
      const { ownerEmail, spendCapDaily } = req.body as {
        ownerEmail?: string;
        spendCapDaily?: string;
      };
      if (!ownerEmail) {
        return res.status(400).json({ error: "ownerEmail is required" });
      }
      await ensureStore();
      const humanDid = await ensureDid("human");
      const agentDid = await ensureDid("agent");
      const result = await issueDelegationCredential({
        ownerDid: humanDid.id,
        agentDid: agentDid.id,
        ownerEmail,
        spendCapDaily
      });
      res.json(result.stored);
    })
  );

  router.post(
    "/agent/run",
    asyncHandler(async (req, res) => {
      await ensureStore();
      const defaultJobsUrl = resolveJobsEndpoint(req, options);
      const { jobs = defaultJobsUrl, includeDelegation = true } = req.body ?? {};
      const events: AgentEvent[] = [];
      try {
        const result = await executeX402Flow(
          jobs,
          { includeDelegation },
          (event: AgentEvent) => events.push(event)
        );
        res.json({ result, events });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message, events });
      }
    })
  );

  router.post(
    "/enroll",
    asyncHandler(async (req, res) => {
      const { email, birthDate, spendCapDaily } = req.body as {
        email?: string;
        birthDate?: string;
        spendCapDaily?: string;
      };
      if (!email) {
        return res.status(400).json({ error: "email is required" });
      }
      if (!birthDate) {
        return res.status(400).json({ error: "birthDate is required" });
      }

      await ensureStore();
      await Promise.all(KEY_ALIASES.map((alias: KeyAlias) => ensureKeypair(alias)));
      const humanDid = await ensureDid("human");
      const agentDid = await ensureDid("agent");
      await ensureDid("issuer");

      const emailVc = await issueEmailCredential({
        subjectDid: humanDid.id,
        email,
        emailVerified: true
      });
      const ageVc = await issueAgeCredential({
        subjectDid: humanDid.id,
        birthDate
      });
      const delegationVc = await issueDelegationCredential({
        ownerDid: humanDid.id,
        agentDid: agentDid.id,
        ownerEmail: email,
        spendCapDaily
      });

      res.json({
        humanDid: humanDid.id,
        agentDid: agentDid.id,
        issued: {
          email: emailVc.stored,
          age: ageVc.stored,
          delegation: delegationVc.stored
        }
      });
    })
  );

  router.post(
    "/export",
    asyncHandler(async (_req, res) => {
      await ensureStore();
      const zip = new AdmZip();
      await addDirectoryToZip(zip, AGNIC_ID_HOME, "");
      const buffer = zip.toBuffer();
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=agnicid-bundle.zip");
      res.json({
        filename: "agnicid-bundle.zip",
        size: buffer.length,
        base64: buffer.toString("base64")
      });
    })
  );

  router.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Wallet API error:", error);
      res.status(500).json({ error: message });
    }
  );

  return router;
};

const resolveJobsEndpoint = (req: express.Request, options: WalletApiOptions) => {
  const absoluteFromPath = buildAbsoluteFromPath(req, options.sellerJobsPath);
  if (absoluteFromPath) {
    return absoluteFromPath;
  }
  if (options.defaultJobsUrl) {
    return options.defaultJobsUrl;
  }
  return "http://localhost:8081/jobs";
};

const buildAbsoluteFromPath = (req: express.Request, pathSuffix?: string) => {
  if (!pathSuffix) {
    return undefined;
  }
  const host = req.get("host");
  if (!host) {
    return undefined;
  }
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
  const scheme = proto || req.protocol || "http";
  return `${scheme}://${host}${pathSuffix}`;
};

const pathExists = (target: string) => storagePathExists(target);

const addDirectoryToZip = async (zip: AdmZip, absoluteDir: string, relativeDir: string) => {
  const files = await listFilesRecursive(absoluteDir);
  for (const relativePath of files) {
    const normalizedRelative = path.join(relativeDir, relativePath);
    const absolutePath = path.join(absoluteDir, normalizedRelative);
    const data = await storageReadFile(absolutePath);
    const buffer = typeof data === "string" ? Buffer.from(data) : data;
    const archivePath = normalizedRelative.split(path.sep).join("/");
    zip.addFile(archivePath, buffer);
  }
};
