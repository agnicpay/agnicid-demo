import { spawn } from "node:child_process";

const processes: Array<{ name: string; proc: ReturnType<typeof spawn> }> = [];

const startProcess = (name: string, command: string, args: string[]) => {
  const proc = spawn(command, args, {
    stdio: "inherit",
    env: process.env
  });
  processes.push({ name, proc });
  proc.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`${name} exited with code ${code}`);
    }
  });
};

console.log("\nAgnic.ID Demo");
console.log("========================================");
console.log("Wallet UI  : http://localhost:5173");
console.log("Seller console : http://localhost:8081");
console.log("\nAgent CLI example:");
console.log("  node packages/agent-sdk/dist/cli.js x402:call --jobs http://localhost:8081/jobs\n");

startProcess("wallet-ui", "npm", ["run", "dev", "--workspace", "@agnicid/wallet-ui"]);
startProcess("service-seller", "npm", ["run", "start", "--workspace", "@agnicid/service-seller"]);

const shutdown = () => {
  console.log("\nShutting down demo...");
  for (const { proc } of processes) {
    proc.kill("SIGINT");
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
