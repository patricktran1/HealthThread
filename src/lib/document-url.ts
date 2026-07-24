import { supabase } from "@/integrations/supabase/client";

/** Get a short-lived signed URL for a file in the private health-documents bucket. */
export async function getDocumentSignedUrl(path: string, expiresIn = 300): Promise<string> {
  const { data, error } = await supabase.storage
    .from("health-documents")
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create signed URL");
  }
  return data.signedUrl;
}

/** Open a stored document in a new tab via a signed URL. */
export async function openDocument(path: string): Promise<void> {
  const url = await getDocumentSignedUrl(path);
  window.open(url, "_blank", "noopener,noreferrer");
}

export function inferKindFromPath(path: string): "pdf" | "image" | "other" {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"].includes(ext)) return "image";
  return "other";
}

export function fileNameFromPath(path: string): string {
  const last = path.split("/").pop() ?? path;
  // strip our `${Date.now()}-` prefix if present
  return last.replace(/^\d{10,}-/, "");
}
