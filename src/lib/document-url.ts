import { supabase } from "@/integrations/supabase/client";

export { fileNameFromPath, inferKindFromPath } from "./document-path";

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
