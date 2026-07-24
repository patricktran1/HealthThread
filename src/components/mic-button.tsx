import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SILENCE_THRESHOLD = 0.015;
const SILENCE_DURATION_MS = 1500;

export function MicButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  function cleanupAudio() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    silenceTimerRef.current = null;
    rafRef.current = null;
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm", "audio/mp4"].find(
        (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
      );
      if (!mimeType) {
        stream.getTracks().forEach((t) => t.stop());
        toast.error("This browser can't record a supported audio format.");
        return;
      }
      const rec = new MediaRecorder(stream, { mimeType });
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        cleanupAudio();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        if (blob.size < 1024) {
          setState("idle");
          toast.error("That recording was empty — please try again.");
          return;
        }
        setState("transcribing");
        try {
          const form = new FormData();
          const ext = rec.mimeType.includes("mp4") ? "mp4" : "webm";
          form.append("file", blob, `recording.${ext}`);
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          if (!res.ok) throw new Error(await res.text().catch(() => "Transcription failed"));
          const { text } = (await res.json()) as { text: string };
          if (text?.trim()) onTranscript(text.trim());
          else toast.error("Didn't catch that — try again.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setState("idle");
        }
      };
      rec.start();
      setState("recording");

      // Set up silence detection
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkSilence = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / dataArray.length);

        if (rms < SILENCE_THRESHOLD) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = window.setTimeout(() => {
              stop();
            }, SILENCE_DURATION_MS);
          }
        } else {
          if (silenceTimerRef.current) {
            window.clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        }
        rafRef.current = requestAnimationFrame(checkSilence);
      };
      rafRef.current = requestAnimationFrame(checkSilence);
    } catch {
      toast.error("Microphone access denied or unavailable.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  useEffect(() => {
    return () => cleanupAudio();
  }, []);

  if (state === "recording") {
    return (
      <Button type="button" size="icon" variant="destructive" onClick={stop} title="Stop recording">
        <Square className="h-4 w-4 animate-pulse" />
      </Button>
    );
  }
  if (state === "transcribing") {
    return (
      <Button type="button" size="icon" variant="outline" disabled title="Transcribing…">
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      onClick={start}
      disabled={disabled}
      title="Speak"
    >
      <Mic className="h-4 w-4" />
    </Button>
  );
}
