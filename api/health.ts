import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";

declare const process: {
  env: Record<string, string | undefined>;
};

const handler = async (_req: VercelRequest, res: VercelResponse) => {
  const timestamp = new Date().toISOString();
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
  const storage = await probeStorage();

  res.status(storage.ok ? 200 : 500).json({
    status: storage.ok ? "ok" : "degraded",
    timestamp,
    env,
    storage
  });
};

const probeStorage = async () => {
  try {
    const { resolveAgnicIdPath, ensureDir, writeFile, readFile } = await import("@agnicid/shared");
    const dir = resolveAgnicIdPath(".health");
    const target = path.join(dir, `health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
    const payload = `health:${new Date().toISOString()}`;
    await ensureDir(path.dirname(target));
    await writeFile(target, payload, "utf-8");
    const roundTrip = await readFile(target, "utf-8");
    return { ok: roundTrip === payload, path: target };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
};

export default handler;
