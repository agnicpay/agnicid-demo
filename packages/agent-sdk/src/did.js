import { promises as fs } from "node:fs";
import { did as sharedDid, resolveAgnicIdPath } from "@agnicid/shared";
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
export const requireDid = async (alias) => {
    const aliases = await readAliases();
    const did = aliases[alias];
    if (!did) {
        throw new Error(`Missing DID for alias ${alias}. Import a wallet bundle before running this command.`);
    }
    const doc = await sharedDid.loadDidDocument(did);
    if (!doc) {
        throw new Error(`DID document ${did} not found on disk.`);
    }
    return doc;
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
//# sourceMappingURL=did.js.map