// Controls how the uploaded document reference is attached to a request body.
//
// The v3 ("standard") Reducto API accepts the document via the `input` field,
// while the legacy (v2) API expects `document_url`. Older configs and
// deployments still rely on `document_url`, so we let the user pick which
// field to use (or auto-detect it from the config, see `resolveApiVersion`).
export type ApiVersion = "standard" | "legacy";

export const API_VERSION_STORAGE_KEY = "api_version";

export const DEFAULT_API_VERSION: ApiVersion = "standard";

export function documentInputField(
  version: ApiVersion
): "input" | "document_url" {
  return version === "standard" ? "input" : "document_url";
}

// Attach the uploaded file reference to a request body using the field name
// that matches the selected API version.
export function withDocumentInput<T extends object>(
  config: T,
  fileId: string,
  version: ApiVersion
): T & Record<string, string> {
  return { ...config, [documentInputField(version)]: fileId };
}

// Best-effort auto-detection: if a config already carries an explicit
// `input`/`document_url` field, or a version marker, honor it. Otherwise fall
// back to the caller-provided default (the toggle value).
export function resolveApiVersion(
  config: unknown,
  fallback: ApiVersion
): ApiVersion {
  if (config && typeof config === "object") {
    const c = config as Record<string, unknown>;
    if ("input" in c) return "standard";
    if ("document_url" in c) return "legacy";
    const version = c.version;
    if (version === "v3" || version === 3 || version === "standard")
      return "standard";
    if (version === "v2" || version === 2 || version === "legacy")
      return "legacy";
  }
  return fallback;
}
