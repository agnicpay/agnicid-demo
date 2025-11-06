#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ensureStore } from "./config.js";
import { ensureKeypair, KEY_ALIASES } from "./keys.js";
import { ensureDid } from "./did.js";
import {
  issueAgeCredential,
  issueDelegationCredential,
  issueEmailCredential
} from "./credentials.js";
import { createPresentation } from "./presentation.js";
import { executeX402Flow } from "./x402.js";
import { listStoredCredentials, loadCredentialByKind } from "./store.js";

const logJson = (label: string, payload: unknown) => {
  console.log(`\n${label}`);
  console.log(JSON.stringify(payload, null, 2));
};

async function commandKeygen(alias?: string) {
  await ensureStore();
  if (alias && alias !== "all") {
    await ensureKeypair(alias as typeof KEY_ALIASES[number]);
    console.log(`Key generated for ${alias}`);
    return;
  }
  for (const keyAlias of KEY_ALIASES) {
    await ensureKeypair(keyAlias);
    console.log(`Key ensured for ${keyAlias}`);
  }
}

async function commandDidInit(alias?: string) {
  await ensureStore();
  if (alias && alias !== "all") {
    const doc = await ensureDid(alias as typeof KEY_ALIASES[number]);
    logJson(`DID for ${alias}`, doc);
    return;
  }
  for (const keyAlias of KEY_ALIASES) {
    const doc = await ensureDid(keyAlias);
    logJson(`DID for ${keyAlias}`, doc);
  }
}

async function commandVcIssue(type: string, argv: any) {
  await ensureStore();
  switch (type) {
    case "email": {
      const did = await ensureDid("human");
      const result = await issueEmailCredential({
        subjectDid: did.id,
        email: argv.email,
        emailVerified: argv.emailVerified !== false
      });
      logJson("Email credential issued", result.stored);
      break;
    }
    case "age": {
      const did = await ensureDid("human");
      const result = await issueAgeCredential({
        subjectDid: did.id,
        birthDate: argv.birthdate
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
        ownerEmail: argv.ownerEmail
      });
      logJson("Delegation credential issued", result.stored);
      break;
    }
    default:
      throw new Error(`Unknown credential type: ${type}`);
  }
}

async function commandVpMake(argv: any) {
  await ensureStore();
  const audience = argv.audience ?? "http://localhost:8081";
  const kinds = (argv.cred as string[]) ?? ["email", "age", "delegation"];
  const credentials: string[] = [];
  for (const kind of kinds) {
    const stored = await loadCredentialByKind(kind);
    if (!stored) {
      throw new Error(`Missing credential ${kind}`);
    }
    credentials.push(stored.jwt);
  }
  const presentation = await createPresentation({
    credentials,
    challengeId: argv.challenge,
    audience
  });
  logJson("Presentation created", presentation);
}

async function commandX402Call(argv: any) {
  await ensureStore();
  const result = await executeX402Flow(argv.jobs, {
    includeDelegation: argv.includeDelegation !== false
  });
  logJson("Challenge", result.challenge);
  logJson("Payment proof", result.paymentProof);
  logJson("Redeem response", result.redeemResponse);
}

async function commandListVcs() {
  await ensureStore();
  const list = await listStoredCredentials();
  logJson("Stored credentials", list);
}

yargs(hideBin(process.argv))
  .scriptName("agnicid")
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
    (args) => commandKeygen(args.alias as string).catch(handleError)
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
    (args) => commandDidInit(args.alias as string).catch(handleError)
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
    (args) =>
      commandVcIssue(args.type as string, {
        email: args.email,
        birthdate: args.birthdate,
        ownerEmail: args.ownerEmail,
        emailVerified: args.emailVerified
      }).catch(handleError)
  )
  .command(
    "vc:list",
    "List stored credentials",
    () => {},
    () => commandListVcs().catch(handleError)
  )
  .command(
    "vp:make",
    "Create verifiable presentation (JWT-VP)",
    (builder) =>
      builder
        .option("challenge", {
          type: "string",
          demandOption: true,
          describe: "Challenge ID / nonce from seller"
        })
        .option("audience", {
          type: "string",
          describe: "Audience value for VP (seller origin)",
          default: "http://localhost:8081"
        })
        .option("cred", {
          type: "array",
          describe: "Credential kinds to include",
          default: ["email", "age", "delegation"]
        }),
    (args) => commandVpMake(args).catch(handleError)
  )
  .command(
    "x402:call",
    "Execute x402 payment + proof flow",
    (builder) =>
      builder
        .option("jobs", {
          type: "string",
          describe: "Seller jobs endpoint URL",
          demandOption: true
        })
        .option("include-delegation", {
          type: "boolean",
          describe: "Include delegation credential",
          default: true
        }),
    (args) => commandX402Call(args).catch(handleError)
  )
  .demandCommand()
  .help()
  .strict()
  .parse();

function handleError(error: unknown) {
  console.error(`\nError: ${(error as Error).message}`);
  process.exit(1);
}
