import express from "express";
import cors from "cors";
import path from "node:path";
import { promises as fs } from "node:fs";
import AdmZip from "adm-zip";
import { AGNIC_ID_HOME, ensureStore, ensureDid, ensureKeypair, issueAgeCredential, issueDelegationCredential, issueEmailCredential, KEY_ALIASES, listStoredCredentials, resolveStorePath } from "@agnicid/agent-sdk";
const PORT = parseInt(process.env.WALLET_API_PORT ?? "8787", 10);
const app = express();
app.use(cors());
app.use(express.json());
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.get("/health", asyncHandler(async (_req, res) => {
    await ensureStore();
    res.json({ status: "ok", home: AGNIC_ID_HOME });
}));
app.get("/api/status", asyncHandler(async (_req, res) => {
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
        keys,
        dids,
        credentials
    });
}));
app.post("/api/enroll", asyncHandler(async (req, res) => {
    const { email, birthDate } = req.body;
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
        ownerEmail: email
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
app.post("/api/export", asyncHandler(async (_req, res) => {
    await ensureStore();
    const zip = new AdmZip();
    await addDirectoryToZip(zip, AGNIC_ID_HOME, "");
    const buffer = zip.toBuffer();
    res.json({
        filename: "agnicid-bundle.zip",
        size: buffer.length,
        base64: buffer.toString("base64")
    });
}));
app.use((error, _req, res, _next) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Wallet API error:", error);
    res.status(500).json({ error: message });
});
app.listen(PORT, () => {
    console.log(`Wallet API listening on http://localhost:${PORT}`);
});
async function pathExists(target) {
    try {
        await fs.access(target);
        return true;
    }
    catch {
        return false;
    }
}
async function addDirectoryToZip(zip, absoluteDir, relativeDir) {
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
}
