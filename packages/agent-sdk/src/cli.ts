#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ensureStore } from "./config.js";
import { createPresentation } from "./presentation.js";
import { executeX402Flow } from "./x402.js";
import { listStoredCredentials, loadCredentialByKind } from "./store.js";

const logJson = (label: string, payload: unknown) => {
  console.log(`\n${label}`);
  console.log(JSON.stringify(payload, null, 2));
};

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
  logJson("Payment envelope", result.paymentEnvelope);
  logJson("Seller response", result.response);
}

async function commandListVcs() {
  await ensureStore();
  const list = await listStoredCredentials();
  logJson("Stored credentials", list);
}

yargs(hideBin(process.argv))
  .scriptName("agnicid")
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
