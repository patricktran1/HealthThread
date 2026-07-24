import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const inForm = await request.formData();
        const file = inForm.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return new Response("Missing audio file", { status: 400 });
        }
        if (file.size > 20 * 1024 * 1024) {
          return new Response("Audio too large", { status: 413 });
        }

        const mime = (file.type || "audio/webm").split(";")[0];
        const extMap: Record<string, string> = {
          "audio/webm": "webm",
          "audio/mp4": "mp4",
          "audio/mpeg": "mp3",
          "audio/wav": "wav",
          "audio/x-wav": "wav",
          "audio/ogg": "ogg",
        };
        const ext = extMap[mime] ?? "webm";

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        upstream.append("file", file, `recording.${ext}`);

        const res = await fetch(
          "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            body: upstream,
          },
        );

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return new Response(body || `Transcription failed (${res.status})`, {
            status: res.status,
          });
        }
        const json = await res.json().catch(() => ({}));
        const text = (json as { text?: string }).text ?? "";
        return new Response(JSON.stringify({ text }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
