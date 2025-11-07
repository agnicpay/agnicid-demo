import { promises as fs } from "node:fs";
import path from "node:path";
import { mkdirp } from "mkdirp";
import { did as sharedDid, resolveAgnicIdPath } from "@agnicid/shared";
import { ensureKeypair } from "./keys.js";
const ALIASES_FILE = resolveAgnicIdPath("dids", "aliases.json");
const readAliases = async () => {
    try {
        const raw = await fs.readFile(ALIASES_FILE, "utf-8");
        return JSON.parse(raw);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return {};
        }
        throw error;
    }
};
const writeAliases = async (aliases) => {
    await mkdirp(path.dirname(ALIASES_FILE));
    await fs.writeFile(ALIASES_FILE, JSON.stringify(aliases, null, 2), "utf-8");
};
const createDidForAlias = async (alias, keypair) => {
    const role = alias;
    const options = alias === "issuer"
        ? { id: "did:sol:agnic:issuer", keyFragment: "key-issuer" }
        : undefined;
    const document = sharedDid.generateDid(role, keypair.publicKey, options);
    await sharedDid.saveDidDocument(document);
    return document.id;
};
export const ensureDid = async (alias) => {
    const aliases = await readAliases();
    if (aliases[alias]) {
        const doc = await sharedDid.loadDidDocument(aliases[alias]);
        if (doc) {
            return doc;
        }
    }
    const keypair = await ensureKeypair(alias);
    const did = await createDidForAlias(alias, keypair);
    aliases[alias] = did;
    await writeAliases(aliases);
    const doc = await sharedDid.loadDidDocument(did);
    if (!doc) {
        throw new Error(`Failed to load DID document for alias ${alias}`);
    }
    return doc;
};
export const getDid = async (alias) => {
    const aliases = await readAliases();
    const did = aliases[alias];
    if (!did) {
        return null;
    }
    return sharedDid.loadDidDocument(did);
};
export const resolveDid = (did) => sharedDid.loadDidDocument(did);
export const listDids = sharedDid.listDidDocuments;
export const getVerificationMethodId = (document) => {
    const method = document.verificationMethod[0];
    if (!method) {
        throw new Error(`No verification method found for DID ${document.id}`);
    }
    return method.id;
};
