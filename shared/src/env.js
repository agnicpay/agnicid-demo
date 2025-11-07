import path from "node:path";
const DEFAULT_HOME = path.join(process.env.HOME ?? process.cwd(), ".agnicid");
export const getAgnicIdHome = () => process.env.AGNICID_HOME ?? DEFAULT_HOME;
export const resolveAgnicIdPath = (...segments) => path.join(getAgnicIdHome(), ...segments);
