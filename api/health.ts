import type { VercelRequest, VercelResponse } from "@vercel/node";

declare const process: {
  env: Record<string, string | undefined>;
};

const handler = async (_req: VercelRequest, res: VercelResponse) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"
  });
};

export default handler;
