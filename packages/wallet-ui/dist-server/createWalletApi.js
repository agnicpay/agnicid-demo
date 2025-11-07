import express from "express";
import cors from "cors";
import path from "node:path";
import { promises as fs } from "node:fs";
import AdmZip from "adm-zip";
import { listStoredCredentials, executeX402Flow } from "@agnicid/agent-sdk";
import { AGNIC_ID_HOME, ensureStore, ensureDid, ensureKeypair, issueAgeCredential, issueDelegationCredential, issueEmailCredential, KEY_ALIASES, resolveStorePath } from "@agnicid/issuer-cli";
export const createWalletApi = (options = {}) => {
    const router = express.Router();
    router.use(cors());
    router.use(express.json());
    const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
    router.get("/health", asyncHandler(async (_req, res) => {
        await ensureStore();
        res.json({ status: "ok", home: AGNIC_ID_HOME });
    }));
    router.get("/status", asyncHandler(async (_req, res) => {
        await ensureStore();
        const keys = await Promise.all(KEY_ALIASES.map(async (alias) => ({
            alias,
            exists: await pathExists(resolveStorePath("keys", `${alias}.key.json`))
        })));
        const dids = await Promise.all(KEY_ALIASES.map(async (alias) => {
            const doc = await ensureDid(alias);
            return { alias, did: doc.id };
        }));
        const credentials = await listStoredCredentials();
        res.json({
            home: AGNIC_ID_HOME,
            keys,
            dids,
            credentials
        });
    }));
    router.get("/credentials", asyncHandler(async (_req, res) => {
        await ensureStore();
        const credentials = await listStoredCredentials();
        res.json(credentials);
    }));
    router.post("/credentials/email", asyncHandler(async (req, res) => {
        const { email, emailVerified = true } = req.body;
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
    }));
    router.post("/credentials/age", asyncHandler(async (req, res) => {
        const { birthDate } = req.body;
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
    }));
    router.post("/credentials/delegation", asyncHandler(async (req, res) => {
        const { ownerEmail, spendCapDaily } = req.body;
        if (!ownerEmail) {
            return res.status(400).json({ error: "ownerEmail is required" });
        }
        await ensureStore();
        const [humanDid, agentDid] = await Promise.all([ensureDid("human"), ensureDid("agent")]);
        const result = await issueDelegationCredential({
            ownerDid: humanDid.id,
            agentDid: agentDid.id,
            ownerEmail,
            spendCapDaily
        });
        res.json(result.stored);
    }));
    router.post("/agent/run", asyncHandler(async (req, res) => {
        await ensureStore();
        const defaultJobsUrl = resolveJobsEndpoint(req, options);
        const { jobs = defaultJobsUrl, includeDelegation = true } = req.body ?? {};
        const events = [];
        try {
            const result = await executeX402Flow(jobs, { includeDelegation }, (event) => events.push(event));
            res.json({ result, events });
        }
        catch (error) {
            res.status(400).json({ error: error.message, events });
        }
    }));
    router.post("/enroll", asyncHandler(async (req, res) => {
        const { email, birthDate, spendCapDaily } = req.body;
        if (!email) {
            return res.status(400).json({ error: "email is required" });
        }
        if (!birthDate) {
            return res.status(400).json({ error: "birthDate is required" });
        }
        await ensureStore();
        await Promise.all(KEY_ALIASES.map((alias) => ensureKeypair(alias)));
        const [humanDid, agentDid] = await Promise.all([ensureDid("human"), ensureDid("agent")]);
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
    }));
    router.post("/export", asyncHandler(async (_req, res) => {
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
    }));
    router.use((error, _req, res, _next) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Wallet API error:", error);
        res.status(500).json({ error: message });
    });
    return router;
};
const resolveJobsEndpoint = (req, options) => {
    const absoluteFromPath = buildAbsoluteFromPath(req, options.sellerJobsPath);
    if (absoluteFromPath) {
        return absoluteFromPath;
    }
    if (options.defaultJobsUrl) {
        return options.defaultJobsUrl;
    }
    return "http://localhost:8081/jobs";
};
const buildAbsoluteFromPath = (req, pathSuffix) => {
    if (!pathSuffix) {
        return undefined;
    }
    const host = req.get("host");
    if (!host) {
        return undefined;
    }
    const proto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim();
    const scheme = proto || req.protocol || "http";
    return `${scheme}://${host}${pathSuffix}`;
};
const pathExists = async (target) => {
    try {
        await fs.access(target);
        return true;
    }
    catch {
        return false;
    }
};
const addDirectoryToZip = async (zip, absoluteDir, relativeDir) => {
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    for (const entry of entries) {
        const absolutePath = path.join(absoluteDir, entry.name);
        const relativePath = path.join(relativeDir, entry.name);
        if (entry.isDirectory()) {
            await addDirectoryToZip(zip, absolutePath, relativePath);
        }
        else if (entry.isFile()) {
            const data = await fs.readFile(absolutePath);
            zip.addFile(relativePath, data);
        }
    }
};
