#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ensureStore } from "./config.js";
import { ensureKeypair, KEY_ALIASES, KeyAlias } from "./keys.js";
import {
  ensureDid,
  listDids,
  createSolanaDidCommand,
  resolveSolanaDidCommand
} from "./did.js";
import {
  issueAgeCredential,
  issueDelegationCredential,
  issueEmailCredential
} from "./credentials.js";
import { readJson } from "./fs.js";
import type { StoredCredential } from "./types.js";
import { listDirectory, resolveAgnicIdPath } from "@agnicid/shared";

const logJson = (label: string, payload: unknown) => {
  console.log(`\n${label}`);
  console.log(JSON.stringify(payload, null, 2));
};

const listCredentials = async () => {
  const dir = resolveAgnicIdPath("vcs");
  try {
    const entries = await readJsonRecords(dir);
    logJson("Stored credentials", entries);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      logJson("Stored credentials", []);
      return;
    }
    throw error;
  }
};

const readJsonRecords = async (dir: string) => {
  const files = await listDirectory(dir);
  const records: StoredCredential[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const record = await readJson<{ credential: StoredCredential["payload"]; jwt: string }>(
      `${dir}/${file}`
    );
    records.push({
      id: record.credential.id ?? file,
      type: Array.isArray(record.credential.type)
        ? record.credential.type.join(",")
        : (record.credential.type as unknown as string),
      jwt: record.jwt,
      payload: record.credential,
      issuedAt: record.credential.issuanceDate,
      path: `${dir}/${file}`
    });
  }
  return records;
};

yargs(hideBin(process.argv))
  .scriptName("agnicid-issuer")
  .command(
    "keygen [alias]",
    "Generate ed25519 keys",
    (builder) =>
      builder
        .positional("alias", {
          describe: "Key alias (human, agent, issuer, all)",
          type: "string",
          default: "all"
        })
        .example("$0 keygen", "Generate keys for human, agent, issuer"),
    async (args) => {
      await ensureStore();
      if (args.alias && args.alias !== "all") {
        await ensureKeypair(args.alias as (typeof KEY_ALIASES)[number]);
        console.log(`Key generated for ${args.alias}`);
        return;
      }
      for (const alias of KEY_ALIASES) {
        await ensureKeypair(alias);
        console.log(`Key ensured for ${alias}`);
      }
    }
  )
  .command(
    "did:init [alias]",
    "Create mock did:sol documents",
    (builder) =>
      builder.positional("alias", {
        describe: "Alias to initialize",
        type: "string",
        default: "all"
      }),
    async (args) => {
      await ensureStore();
      if (args.alias && args.alias !== "all") {
        const doc = await ensureDid(args.alias as (typeof KEY_ALIASES)[number]);
        logJson(`DID for ${args.alias}`, doc);
        return;
      }
      const docs = [];
      for (const alias of KEY_ALIASES) {
        docs.push(await ensureDid(alias));
      }
      logJson("DIDs", docs);
    }
  )
  .command(
    "vc:issue <type>",
    "Issue Verifiable Credential",
    (builder) =>
      builder
        .positional("type", {
          describe: "Credential type (email|age|delegation)",
          type: "string",
          demandOption: true
        })
        .option("email", {
          describe: "Email address for email credential",
          type: "string"
        })
        .option("email-verified", {
          describe: "Set email_verified flag",
          type: "boolean",
          default: true
        })
        .option("birthdate", {
          describe: "Birthdate (YYYY-MM-DD) for age credential",
          type: "string"
        })
        .option("owner-email", {
          describe: "Owner email for delegation credential",
          type: "string"
        })
        .option("spend-cap", {
          describe: "Delegation spend cap (e.g., '250 USDC')",
          type: "string",
          default: "100 USDC"
        })
        .check((argv) => {
          if (argv.type === "email" && !argv.email) {
            throw new Error("--email is required for email credential");
          }
          if (argv.type === "age" && !argv.birthdate) {
            throw new Error("--birthdate is required for age credential");
          }
          if (argv.type === "delegation" && !argv.ownerEmail) {
            throw new Error("--owner-email is required for delegation credential");
          }
          return true;
        }),
    async (args) => {
      await ensureStore();
      switch (args.type) {
        case "email": {
          const humanDid = await ensureDid("human");
          const result = await issueEmailCredential({
            subjectDid: humanDid.id,
            email: args.email as string,
            emailVerified: args["email-verified"] !== false
          });
          logJson("Email credential issued", result.stored);
          break;
        }
        case "age": {
          const humanDid = await ensureDid("human");
          const result = await issueAgeCredential({
            subjectDid: humanDid.id,
            birthDate: args.birthdate as string
          });
          logJson("Age credential issued", result.stored);
          break;
        }
        case "delegation": {
          const humanDid = await ensureDid("human");
          const agentDid = await ensureDid("agent");
          const result = await issueDelegationCredential({
            ownerDid: humanDid.id,
            agentDid: agentDid.id,
            ownerEmail: args.ownerEmail as string,
            spendCapDaily: (args["spend-cap"] as string) ?? "100 USDC"
          });
          logJson("Delegation credential issued", result.stored);
          break;
        }
        default:
          throw new Error(`Unknown credential type: ${args.type}`);
      }
    }
  )
  .command(
    "vc:list",
    "List stored credentials",
    () => {},
    async () => {
      await ensureStore();
      await listCredentials();
    }
  )
  .command(
    "did:list",
    "List DID documents",
    () => {},
    async () => {
      await ensureStore();
      const dids = await listDids();
      logJson("DIDs", dids);
    }
  )
  .command(
    "did:sol:create [alias]",
    "Create a new Solana DID",
    (yargs) => {
      return yargs.positional("alias", {
        describe: "Alias for the DID (e.g., human, agent)",
        type: "string",
        choices: KEY_ALIASES
      });
    },
    async (argv) => {
      await ensureStore();
      const alias = argv.alias as KeyAlias;
      await createSolanaDidCommand(alias);
    }
  )
  .command(
    "did:sol:resolve [did]",
    "Resolve a Solana DID document",
    (yargs) => {
      return yargs.positional("did", {
        describe: "DID to resolve (e.g., did:sol:devnet:...)",
        type: "string",
        demandOption: true
      });
    },
    async (argv) => {
      await ensureStore();
      await resolveSolanaDidCommand(argv.did as string);
    }
  )
  .demandCommand()
  .help()
  .strict()
  .parse();
