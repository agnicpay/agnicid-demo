import { promises as fs } from "node:fs";
export const readJson = async (file) => {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw);
};
export const writeJson = async (file, data) => {
    await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
};
