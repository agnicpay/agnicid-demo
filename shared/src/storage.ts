import path from "node:path";
import { promises as nodeFs } from "node:fs";
import { mkdirp } from "mkdirp";
import {
  put,
  head,
  list,
  del,
  BlobNotFoundError,
  BlobServiceRateLimited,
  BlobServiceNotAvailable
} from "@vercel/blob";
import type { ListBlobResultBlob } from "@vercel/blob";
import { getAgnicIdHome, resolveAgnicIdPath } from "./env.js";

const STORAGE_ENV = (process.env.AGNICID_STORAGE ?? "").toLowerCase();
const SHOULD_USE_BLOB =
  STORAGE_ENV === "blob" ||
  (STORAGE_ENV === "" && Boolean(process.env.BLOB_READ_WRITE_TOKEN) && Boolean(process.env.VERCEL));
const STORAGE_MODE = SHOULD_USE_BLOB ? "blob" : "fs";

const DEFAULT_NAMESPACE = process.env.AGNICID_BLOB_NAMESPACE ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "local";
const BLOB_PREFIX = [process.env.AGNICID_BLOB_PREFIX ?? "agnicid", DEFAULT_NAMESPACE]
  .filter(Boolean)
  .join("/")
  .replace(/\/+/g, "/");

const ensureTrailingSlash = (value: string) => (value.endsWith("/") ? value : `${value}/`);

const normalizeRelative = (target: string) => target.replace(/\\/g, "/");

const createNotFoundError = (target: string) => {
  const error = new Error(`ENOENT: no such file or directory, open '${target}'`) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
};

const resolveInsideHome = (input: string) => {
  const resolved = path.resolve(input);
  return resolved;
};

const relativeToHome = (absolutePath: string) => {
  const home = path.resolve(getAgnicIdHome());
  const absolute = resolveInsideHome(absolutePath);
  const relative = path.relative(home, absolute);
  if (relative.startsWith("..")) {
    throw new Error(`Path "${absolutePath}" is outside of AGNICID_HOME (${home})`);
  }
  return normalizeRelative(relative);
};

const toBlobKey = (absolutePath: string) => {
  const relative = relativeToHome(absolutePath);
  return normalizeRelative(`${BLOB_PREFIX}/${relative}`).replace(/\/+/g, "/");
};

const fetchAllBlobs = async (options: { prefix: string }) => {
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const response = await list({ ...options, cursor });
    blobs.push(...response.blobs);
    cursor = response.hasMore ? response.cursor : undefined;
  } while (cursor);
  return blobs;
};

const downloadBlob = async (key: string) => {
  try {
    const metadata = await head(key);
    const response = await fetch(metadata.downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download blob ${key}: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      throw createNotFoundError(key);
    }
    throw error;
  }
};

const uploadBlob = async (key: string, data: Buffer, contentType?: string) => {
  await put(key, data, {
    access: "public",
    contentType
  });
};

const deleteBlob = async (key: string) => {
  try {
    await del(key);
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return;
    }
    throw error;
  }
};

export const getStorageMode = () => STORAGE_MODE;

export const isBlobStorage = () => SHOULD_USE_BLOB;

export const ensureDir = async (dir: string) => {
  if (!SHOULD_USE_BLOB) {
    await mkdirp(dir);
  }
};

export async function pathExists(target: string): Promise<boolean> {
  if (!SHOULD_USE_BLOB) {
    try {
      await nodeFs.access(target);
      return true;
    } catch {
      return false;
    }
  }
  const key = toBlobKey(target);
  try {
    await head(key);
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      const dirPrefix = ensureTrailingSlash(key);
      const blobs = await list({ prefix: dirPrefix, limit: 1 });
      return blobs.blobs.length > 0;
    }
    if (error instanceof BlobServiceRateLimited || error instanceof BlobServiceNotAvailable) {
      throw error;
    }
    return false;
  }
}

export async function readFile(pathname: string): Promise<Buffer>;
export async function readFile(pathname: string, encoding: BufferEncoding): Promise<string>;
export async function readFile(pathname: string, encoding?: BufferEncoding): Promise<string | Buffer> {
  if (!SHOULD_USE_BLOB) {
    return encoding ? nodeFs.readFile(pathname, encoding) : nodeFs.readFile(pathname);
  }
  const key = toBlobKey(pathname);
  const buffer = await downloadBlob(key);
  return encoding ? buffer.toString(encoding) : buffer;
}

export async function writeFile(pathname: string, data: string, encoding?: BufferEncoding): Promise<void>;
export async function writeFile(pathname: string, data: Buffer): Promise<void>;
export async function writeFile(
  pathname: string,
  data: string | Buffer,
  encoding?: BufferEncoding
): Promise<void> {
  if (!SHOULD_USE_BLOB) {
    if (typeof data === "string") {
      await nodeFs.writeFile(pathname, data, encoding ?? "utf-8");
    } else {
      await nodeFs.writeFile(pathname, data);
    }
    return;
  }
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, encoding ?? "utf-8");
  await uploadBlob(toBlobKey(pathname), buffer, typeof data === "string" ? "application/json" : undefined);
}

export const deleteFile = async (pathname: string) => {
  if (!SHOULD_USE_BLOB) {
    try {
      await nodeFs.unlink(pathname);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
    return;
  }
  await deleteBlob(toBlobKey(pathname));
};

export const readJson = async <T>(pathname: string): Promise<T> => {
  const raw = await readFile(pathname, "utf-8");
  return JSON.parse(raw) as T;
};

export const writeJson = async (pathname: string, data: unknown) => {
  await writeFile(pathname, JSON.stringify(data, null, 2), "utf-8");
};

const listLocalFilesRecursive = async (dir: string, base: string): Promise<string[]> => {
  const entries = await nodeFs.readdir(dir, { withFileTypes: true });
  const items: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listLocalFilesRecursive(fullPath, base);
      for (const child of nested) {
        items.push(child);
      }
    } else if (entry.isFile()) {
      const relative = normalizeRelative(path.relative(base, fullPath));
      items.push(relative);
    }
  }
  return items;
};

export const listDirectory = async (dir: string): Promise<string[]> => {
  if (!SHOULD_USE_BLOB) {
    return nodeFs.readdir(dir);
  }
  const prefix = ensureTrailingSlash(toBlobKey(dir));
  const blobs = await fetchAllBlobs({ prefix });
  if (blobs.length === 0) {
    throw createNotFoundError(dir);
  }
  const entries = new Set<string>();
  for (const blob of blobs) {
    const remainder = blob.pathname.slice(prefix.length);
    if (!remainder) {
      continue;
    }
    const immediate = remainder.split("/")[0];
    if (immediate) {
      entries.add(immediate);
    }
  }
  if (entries.size === 0) {
    throw createNotFoundError(dir);
  }
  return Array.from(entries);
};

export const listFilesRecursive = async (dir: string): Promise<string[]> => {
  if (!SHOULD_USE_BLOB) {
    try {
      return await listLocalFilesRecursive(dir, dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
  const prefix = ensureTrailingSlash(toBlobKey(dir));
  const blobs = await fetchAllBlobs({ prefix });
  return blobs
    .filter((blob) => !blob.pathname.endsWith("/"))
    .map((blob) => blob.pathname.slice(prefix.length))
    .filter(Boolean);
};

export const getStorageDebugInfo = () => ({
  mode: STORAGE_MODE,
  storageEnv: STORAGE_ENV,
  agnicidHome: getAgnicIdHome(),
  hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  vercel: Boolean(process.env.VERCEL),
  blobPrefix: BLOB_PREFIX
});

export const probeStorage = async (): Promise<boolean> => {
  const probeDir = resolveAgnicIdPath(".health");
  const probePath = path.join(
    probeDir,
    `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`
  );
  const payload = `agnic-probe:${new Date().toISOString()}`;
  await ensureDir(path.dirname(probePath));
  await writeFile(probePath, payload, "utf-8");
  const readBack = await readFile(probePath, "utf-8");
  await deleteFile(probePath).catch(() => {});
  return readBack === payload;
};
