const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"]);

export type DocumentKind = "pdf" | "image" | "other";

export function inferKindFromPath(path: string): DocumentKind {
  const cleanPath = path.split(/[?#]/, 1)[0] ?? "";
  const fileName = cleanPath.split("/").pop() ?? "";
  const dot = fileName.lastIndexOf(".");
  const extension = dot >= 0 ? fileName.slice(dot + 1).toLocaleLowerCase("en-US") : "";
  if (extension === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return "other";
}

export function fileNameFromPath(path: string): string {
  const cleanPath = path.split(/[?#]/, 1)[0] ?? "";
  const last = cleanPath.split("/").pop() ?? "";
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // Preserve malformed percent-encoded names rather than throwing in the UI.
  }
  return decoded.replace(/^\d{10,}-/, "");
}
