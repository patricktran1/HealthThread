import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExtractedEventDto } from "./pdf-extract.functions";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export const extractPhotoEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileBase64: string; mimeType: string }) => {
    if (!input?.fileBase64 || typeof input.fileBase64 !== "string") {
      throw new Error("fileBase64 is required");
    }
    if (!input?.mimeType || !ALLOWED_MIME.has(input.mimeType)) {
      throw new Error(`Unsupported image type: ${input?.mimeType ?? "unknown"}`);
    }
    return { fileBase64: input.fileBase64, mimeType: input.mimeType };
  })
  .handler(async ({ data }): Promise<{ events: ExtractedEventDto[] }> => {
    const { extractEventsFromImage } = await import("./photo-extract.server");
    const today = new Date().toISOString().slice(0, 10);
    const events = await extractEventsFromImage(data.fileBase64, data.mimeType, today);
    return { events };
  });
