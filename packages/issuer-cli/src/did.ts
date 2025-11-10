import path from "node:path";
import { ensureDir, readFile, writeFile } from "@agnicid/shared";
import type { DidDocument, Keypair as StoredKeypair } from "@agnicid/shared";
import { did as sharedDid, resolveAgnicIdPath } from "@agnicid/shared";
import { ensureKeypair, fromUint8Array, KeyAlias, saveKeyAlias } from "./keys.js";
import { createSolanaDid, getDidDocument } from "./sol-did.js";
import type { Keypair as SolanaKeypair } from "@solana/web3.js";
import { nanoid } from "nanoid";

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

const STATIC_ALIAS_OPTIONS: Partial<
  Record<
    DidAlias,
    {
      id: string;
      keyFragment?: string;
    }
  >
> = {
  issuer: { id: "did:web:agnic.id:issuer", keyFragment: "key-issuer" }
};

const AGENT_DID_PREFIX = "did:web:agnic.id:agents:";
const AGENT_DID_FRAGMENT = "key-agent";

const buildAgentDid = () => `${AGENT_DID_PREFIX}${nanoid(10)}`;

const getAliasOptions = (alias: DidAlias) => {
  if (alias === "agent") {
    return { id: buildAgentDid(), keyFragment: AGENT_DID_FRAGMENT };
  }
  return STATIC_ALIAS_OPTIONS[alias];
};

const desiredDidForAlias = (alias: DidAlias) => STATIC_ALIAS_OPTIONS[alias]?.id;

const createDidForAlias = async (alias: DidAlias, keypair: StoredKeypair) => {
  const role = alias;
  const options = getAliasOptions(alias);
  const document = sharedDid.generateDid(role, keypair.publicKey, options);
  await sharedDid.saveDidDocument(document);
  return document.id;
};

const SOLANA_ALIAS = new Set<DidAlias>(["human"]);
const SOLANA_DID_PREFIX = "did:sol:";

const isSolanaAlias = (alias: DidAlias) => SOLANA_ALIAS.has(alias);

const persistAlias = async (alias: DidAlias, did: string, aliases: AliasRegistry) => {
  aliases[alias] = did;
  await writeAliases(aliases);
};

const convertSolanaKeypair = (keypair: SolanaKeypair): StoredKeypair => ({
  publicKey: fromUint8Array(keypair.publicKey.toBytes()),
  secretKey: fromUint8Array(keypair.secretKey)
});

const saveSolanaDidLocally = async (
  alias: DidAlias,
  aliases: AliasRegistry,
  { did, keypair, document }: Awaited<ReturnType<typeof createSolanaDid>>,
  options: { replaceExisting?: boolean; allowUnsupportedAlias?: boolean } = {}
) => {
  if (!options.allowUnsupportedAlias && !isSolanaAlias(alias)) {
    throw new Error(`Alias ${alias} is not configured for Solana DID provisioning`);
  }
  if (!options.replaceExisting && aliases[alias]) {
    throw new Error(`DID already exists for alias ${alias}`);
  }
  await saveKeyAlias(alias, convertSolanaKeypair(keypair));
  await sharedDid.saveDidDocument(document);
  await persistAlias(alias, did, aliases);
  return document;
};

const loadDocumentForAlias = async (alias: DidAlias, did: string) => {
  const doc = await sharedDid.loadDidDocument(did);
  if (doc) {
    return doc;
  }
  if (isSolanaAlias(alias) && did.startsWith(SOLANA_DID_PREFIX)) {
    const resolved = await getDidDocument(did);
    await sharedDid.saveDidDocument(resolved);
    return resolved;
  }
  return null;
};

const createMockDidForAlias = async (
  alias: DidAlias,
  aliases: AliasRegistry,
  options: { replaceExisting?: boolean } = {}
) => {
  if (!options.replaceExisting && aliases[alias]) {
    throw new Error(`DID already exists for alias ${alias}`);
  }
  const keypair = await ensureKeypair(alias);
  const did = await createDidForAlias(alias, keypair);
  await persistAlias(alias, did, aliases);
  const doc = await sharedDid.loadDidDocument(did);
  if (!doc) {
    throw new Error(`Failed to load DID document for alias ${alias}`);
  }
  return doc;
};

const shouldReplaceExistingDid = (alias: DidAlias, did?: string) => {
  if (!did) {
    return false;
  }
  const desired = desiredDidForAlias(alias);
  if (desired) {
    return desired !== did;
  }
  if (alias === "agent") {
    return !did.startsWith(AGENT_DID_PREFIX);
  }
  return false;
};

export const ensureDid = async (alias: DidAlias) => {
  const aliases = await readAliases();
  const existingDid = aliases[alias];
  const needsReplacement = shouldReplaceExistingDid(alias, existingDid);
  if (existingDid && !needsReplacement) {
    const doc = await loadDocumentForAlias(alias, existingDid);
    if (doc) {
      return doc;
    }
  }

  if (isSolanaAlias(alias)) {
    const document = await saveSolanaDidLocally(alias, aliases, await createSolanaDid(), {
      replaceExisting: Boolean(existingDid)
    });
    return document;
  }

  return createMockDidForAlias(alias, aliases, {
    replaceExisting: Boolean(existingDid) || needsReplacement
  });
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
  if (!alias) {
    throw new Error("Alias is required for creating a Solana DID");
  }
  const aliases = await readAliases();
  const document = await saveSolanaDidLocally(alias, aliases, await createSolanaDid(), {
    replaceExisting: true,
    allowUnsupportedAlias: true
  });
  const verificationMethod = document.verificationMethod[0];
  console.log(`Created Solana DID for ${alias}:`, document.id);
  if (verificationMethod?.publicKeyBase58) {
    console.log("Public Key:", verificationMethod.publicKeyBase58);
  }
  return document.id;
};

export const resolveSolanaDidCommand = async (did: string) => {
  const doc = await getDidDocument(did);
  console.log("Resolved DID Document:", JSON.stringify(doc, null, 2));
  return doc;
};
