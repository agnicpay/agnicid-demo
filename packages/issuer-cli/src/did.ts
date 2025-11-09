import path from "node:path";
import { Keypair, ensureDir, readFile, writeFile } from "@agnicid/shared";
import type { DidDocument } from "@agnicid/shared";
import { did as sharedDid, resolveAgnicIdPath } from "@agnicid/shared";
import { ensureKeypair, KeyAlias } from "./keys.js";
import { createSolanaDid, getDidDocument } from "./sol-did.js";

type DidAlias = KeyAlias;

interface AliasRegistry {
  [alias: string]: string;
}

const getAliasesFile = () => resolveAgnicIdPath("dids", "aliases.json");

const writeAliases = async (aliases: AliasRegistry) => {
  const aliasesFile = getAliasesFile();
  await ensureDir(path.dirname(aliasesFile));
  await writeFile(aliasesFile, JSON.stringify(aliases, null, 2), "utf-8");
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
    throw new Error(`Failed to parse DID alias registry. ${String(error)}`);
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

const createDidForAlias = async (alias: DidAlias, keypair: Keypair) => {
  const role = alias;
  const options =
    alias === "issuer"
      ? { id: "did:sol:agnic:issuer", keyFragment: "key-issuer" }
      : undefined;
  const document = sharedDid.generateDid(role, keypair.publicKey, options);
  await sharedDid.saveDidDocument(document);
  return document.id;
};

export const ensureDid = async (alias: DidAlias) => {
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

export const getDid = async (alias: DidAlias) => {
  const aliases = await readAliases();
  const did = aliases[alias];
  if (!did) {
    return null;
  }
  return sharedDid.loadDidDocument(did);
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

// Solana DID CLI commands
export const createSolanaDidCommand = async (alias: DidAlias) => {
  const { did, keypair } = await createSolanaDid();
  // Store the DID in the aliases registry
  const aliases = await readAliases();
  aliases[alias] = did;
  await writeAliases(aliases);
  console.log("Created Solana DID:", did);
  console.log("Public Key:", keypair.publicKey.toBase58());
  return did;
};

export const resolveSolanaDidCommand = async (did: string) => {
  const doc = await getDidDocument(did);
  console.log("Resolved DID Document:", JSON.stringify(doc, null, 2));
  return doc;
};

