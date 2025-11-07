import { promises as fs } from "node:fs";
import path from "node:path";
import { mkdirp } from "mkdirp";
import { nanoid } from "nanoid";
import { decode, toBase58 } from "../crypto/index.js";
import { resolveAgnicIdPath } from "../env.js";
const DID_PREFIX = "did:sol:agnic";
const didFilePath = (did) => {
    const slug = did.replace(/[:]/g, "_");
    return resolveAgnicIdPath("dids", `${slug}.json`);
};
export const generateDid = (role, publicKeyBase64, options = {}) => {
    const identifier = options.id ?? `${DID_PREFIX}:${role}:${nanoid(12)}`;
    const fragment = options.keyFragment ?? "key-1";
    const verificationMethodId = `${identifier}#${fragment}`;
    const publicKeyBytes = decode(publicKeyBase64);
    return {
        id: identifier,
        verificationMethod: [
            {
                id: verificationMethodId,
                type: "Ed25519VerificationKey2020",
                controller: identifier,
                publicKeyBase58: toBase58(publicKeyBytes)
            }
        ],
        authentication: [verificationMethodId],
        assertionMethod: [verificationMethodId],
        capabilityDelegation: [verificationMethodId],
        capabilityInvocation: [verificationMethodId]
    };
};
export const saveDidDocument = async (document) => {
    const file = didFilePath(document.id);
    await mkdirp(path.dirname(file));
    await fs.writeFile(file, JSON.stringify(document, null, 2), "utf-8");
    return file;
};
export const loadDidDocument = async (did) => {
    try {
        const file = didFilePath(did);
        const raw = await fs.readFile(file, "utf-8");
        return JSON.parse(raw);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
};
export const listDidDocuments = async () => {
    const dir = resolveAgnicIdPath("dids");
    try {
        const entries = await fs.readdir(dir);
        const documents = [];
        for (const entry of entries) {
            if (!entry.endsWith(".json")) {
                continue;
            }
            const raw = await fs.readFile(path.join(dir, entry), "utf-8");
            documents.push(JSON.parse(raw));
        }
        return documents;
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
};
