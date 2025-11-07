import { promises as fs } from "node:fs";
import type { DidDocument } from "@agnicid/shared";
import { did as sharedDid, resolveAgnicIdPath } from "@agnicid/shared";
import type { KeyAlias } from "./keys.js";

type DidAlias = KeyAlias;

interface AliasRegistry {
  [alias: string]: string;
}

const ALIASES_FILE = resolveAgnicIdPath("dids", "aliases.json");

const readAliases = async (): Promise<AliasRegistry> => {
  try {
    const raw = await fs.readFile(ALIASES_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
};

export const requireDid = async (alias: DidAlias): Promise<DidDocument> => {
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

export const resolveDid = (did: string) => sharedDid.loadDidDocument(did);

export const listDids = sharedDid.listDidDocuments;

export const getVerificationMethodId = (document: DidDocument) => {
  const method = document.verificationMethod[0];
  if (!method) {
    throw new Error(`No verification method found for DID ${document.id}`);
  }
  return method.id;
};
