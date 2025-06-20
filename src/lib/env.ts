// Consolidated environment variables used across the project.
type ImportMetaEnv = {
  readonly VITE_API_URL: string | undefined;
  readonly VITE_API_TOKEN: string | undefined;
  readonly VITE_ENABLE_LOCAL_PERSIST: string | undefined;
};

const ENV = import.meta.env as unknown as ImportMetaEnv;

export const API_URL: string =
  ENV.VITE_API_URL ?? "https://platform.reducto.ai";
export const API_TOKEN: string = ENV.VITE_API_TOKEN ?? "";
export const ENABLE_LOCAL_PERSIST: boolean =
  (ENV.VITE_ENABLE_LOCAL_PERSIST ?? "false") === "true";

export const env = {
  apiUrl: API_URL,
  apiToken: API_TOKEN,
  enableLocalPersist: ENABLE_LOCAL_PERSIST,
} as const;
