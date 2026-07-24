import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ExtractedEventDto = {
  event_date: string;
  event_type: string;
  title: string;
  description?: string;
  provider?: string;
  location?: string;
  tags?: string[];
};

/** Parse an uploaded PDF (base64) and extract structured events. */
export const extractPdfEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileBase64: string }) => {
    if (!input?.fileBase64 || typeof input.fileBase64 !== "string") {
      throw new Error("fileBase64 is required");
    }
    return { fileBase64: input.fileBase64 };
  })
  .handler(async ({ data }): Promise<{ events: ExtractedEventDto[]; textPreview: string }> => {
    const { pdfToText, extractEventsFromText } = await import("./pdf-extract.server");
    const bytes = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const text = await pdfToText(bytes);
    if (!text.trim()) {
      throw new Error("Could not read any text from this PDF (it may be a scan).");
    }
    const today = new Date().toISOString().slice(0, 10);
    const events = await extractEventsFromText(text, today);
    return { events, textPreview: text.slice(0, 500) };
  });
