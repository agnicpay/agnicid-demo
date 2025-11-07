import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const entry = path.resolve(__dirname, "..", "dist-server", "index.js");

let child;
let restartTimer;
let shuttingDown = false;

const waitForBuild = async () => {
  while (!existsSync(entry)) {
    process.stdout.write("[wallet-ui] waiting for server build…\n");
    await delay(300);
  }
};

const startServer = () => {
  child = spawn(process.execPath, [entry], { stdio: "inherit" });
  child.on("exit", (code) => {
    if (shuttingDown) {
      process.exit(code ?? 0);
      return;
    }
    // If the process exited unexpectedly (e.g., due to crash), restart automatically.
    process.stdout.write("[wallet-ui] server exited, restarting…\n");
    startServer();
  });
  process.stdout.write("[wallet-ui] server running from dist-server/index.js\n");
};

const restartServer = () => {
  if (!child) {
    startServer();
    return;
  }
  process.stdout.write("[wallet-ui] rebuilding server… restarting\n");
  child.once("exit", () => {
    if (!shuttingDown) {
      startServer();
    }
  });
  child.kill();
};

const scheduleRestart = () => {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => restartServer(), 200);
};

const watchDist = () => {
  const dir = path.dirname(entry);
  watch(dir, (event, filename) => {
    if (filename && filename.endsWith(".js")) {
      scheduleRestart();
    }
  });
};

const shutdown = () => {
  shuttingDown = true;
  clearTimeout(restartTimer);
  if (child) {
    child.kill();
  } else {
    process.exit(0);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await waitForBuild();
startServer();
watchDist();
