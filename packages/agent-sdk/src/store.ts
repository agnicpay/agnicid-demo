import path from "node:path";
import { listDirectory, resolveAgnicIdPath } from "@agnicid/shared";
import { readJson } from "./fs.js";
import type { StoredCredential } from "./types.js";

export const listStoredCredentials = async (): Promise<StoredCredential[]> => {
  try {
    const vcsDir = resolveAgnicIdPath("vcs");
    const files = await listDirectory(vcsDir);
    const records: StoredCredential[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const fullPath = path.join(vcsDir, file);
      const data = await readJson<{ credential: any; jwt: string }>(fullPath);
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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

export const loadCredentialByKind = async (kind: string) => {
  const all = await listStoredCredentials();
  return all
    .filter((item) => item.kind === kind)
    .sort(
      (a, b) =>
        new Date(b.issuedAt ?? 0).getTime() - new Date(a.issuedAt ?? 0).getTime()
    )[0];
};
