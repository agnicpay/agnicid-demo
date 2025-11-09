import type { DidDocument } from "@agnicid/shared";
import { did as sharedDid, ensureDir, readFile, resolveAgnicIdPath, writeFile } from "@agnicid/shared";
import type { KeyAlias } from "./keys.js";

type DidAlias = KeyAlias;

interface AliasRegistry {
  [alias: string]: string;
}

const getAliasesFile = () => resolveAgnicIdPath("dids", "aliases.json");

const writeAliases = async (aliases: AliasRegistry) => {
  await ensureDir(resolveAgnicIdPath("dids"));
  await writeFile(getAliasesFile(), JSON.stringify(aliases, null, 2), "utf-8");
};

const parseAliases = async (raw: string): Promise<AliasRegistry> => {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const repaired = repairAliases(raw);
    if (repaired) {
      await writeAliases(repaired);
      return repaired;
    }
    throw error;
  }
};

const repairAliases = (raw: string): AliasRegistry | null => {
  let index = raw.lastIndexOf("}");
  while (index !== -1) {
    const candidate = raw.slice(0, index + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      index = raw.lastIndexOf("}", index - 1);
    }
  }
  return null;
};

const readAliases = async (): Promise<AliasRegistry> => {
  try {
    const raw = await readFile(getAliasesFile(), "utf-8");
    return parseAliases(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
};

const resolveAliasFromDocuments = async (alias: DidAlias) => {
  const docs = await sharedDid.listDidDocuments();
  for (const doc of docs) {
    const id = doc?.id;
    if (typeof id === "string" && id.includes(`:${alias}:`)) {
      return doc;
    }
  }
  return null;
};

export const requireDid = async (alias: DidAlias): Promise<DidDocument> => {
  const aliases = await readAliases();
  const did = aliases[alias];
  if (did) {
    const doc = await sharedDid.loadDidDocument(did);
    if (doc) {
      return doc;
    }
  }
  const fallback = await resolveAliasFromDocuments(alias);
  if (fallback) {
    aliases[alias] = fallback.id;
    await writeAliases(aliases);
    return fallback;
  }
  throw new Error(`Missing DID for alias ${alias}. Import a wallet bundle before running this command.`);
};

export const resolveDid = (did: string) => sharedDid.loadDidDocument(did);

export const listDids = sharedDid.listDidDocuments;

export const getVerificationMethodId = (document: DidDocument) => {
  const method = document.verificationMethod[0];
  if (!method) {
    throw new Error(`No verification method found for DID ${document.id}`);
  }
  return method.id;
};
