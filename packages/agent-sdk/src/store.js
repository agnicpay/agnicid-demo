import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveAgnicIdPath } from "@agnicid/shared";
import { readJson } from "./fs.js";
const VCS_DIR = resolveAgnicIdPath("vcs");
export const listStoredCredentials = async () => {
    try {
        const files = await fs.readdir(VCS_DIR);
        const records = [];
        for (const file of files) {
            if (!file.endsWith(".json")) {
                continue;
            }
            const fullPath = path.join(VCS_DIR, file);
            const data = await readJson(fullPath);
            records.push({
                id: data.credential.id,
                type: Array.isArray(data.credential.type) ? data.credential.type.join(",") : String(data.credential.type),
                jwt: data.jwt,
                payload: data.credential,
                issuedAt: data.credential.issuanceDate,
                path: fullPath,
                kind: file.split("-")[0]
            });
        }
        return records;
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
};
export const loadCredentialByKind = async (kind) => {
    const all = await listStoredCredentials();
    return all
        .filter((item) => item.kind === kind)
        .sort((a, b) => new Date(b.issuedAt ?? 0).getTime() - new Date(a.issuedAt ?? 0).getTime())[0];
};
