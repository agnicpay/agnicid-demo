import path from "node:path";

const DEFAULT_HOME = path.join(process.env.HOME ?? process.cwd(), ".agnicid");

let overrideHome: string | undefined;

export const setAgnicIdHomeOverride = (home?: string) => {
  overrideHome = home;
};

export const getAgnicIdHome = () =>
  overrideHome ?? process.env.AGNICID_HOME ?? DEFAULT_HOME;

export const resolveAgnicIdPath = (...segments: string[]) => path.join(getAgnicIdHome(), ...segments);
