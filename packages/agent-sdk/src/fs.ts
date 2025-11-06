import { promises as fs } from "node:fs";

export const readJson = async <T>(file: string): Promise<T> => {
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw) as T;
};

export const writeJson = async (file: string, data: unknown) => {
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
};
