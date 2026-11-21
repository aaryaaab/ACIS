"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mic, Square } from "lucide-react";
import { ApiError } from "@/lib/api";
import { acis } from "@/lib/endpoints";
import { dictationSupported, startDictation } from "@/lib/speech";
import type { JournalEntry } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { Button, Notice, TextAreaField } from "./ui";

export function VoiceJournal({ onSaved }: { onSaved: (e: JournalEntry) => void }) {
  const status = useAsync(() => acis.voice.status(), []);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState<"dictation" | "audio" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<JournalEntry | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(dictationSupported()), []);
  useEffect(() => () => stopRef.current?.(), []);

  const serverStt = status.data?.speech_to_text === true;

  function dictate() {
    setError(null);
    const h = startDictation((t) => setText((p) => (p ? `${p} ${t}` : t)), (err) => { setRecording(null); if (err) setError(err); });
    stopRef.current = h.stop;
    setRecording("dictation");
  }

  async function recordAudio() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        setBusy(true);
        try {
          const r = await acis.voice.sendAudio(new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }));
          setDone(r); onSaved(r);
        } catch (e) { setError(e instanceof ApiError ? e.message : "Could not transcribe the recording."); }
        finally { setBusy(false); }
      };
      mr.start();
      stopRef.current = () => mr.stop();
      setRecording("audio");
    } catch { setError("Could not use the microphone. Allow access in your browser, or type instead."); }
  }

  function stop() { stopRef.current?.(); stopRef.current = null; if (recording === "dictation") setRecording(null); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) { setError("Say or type something first."); return; }
    setBusy(true); setError(null);
    try { const r = await acis.voice.sendTranscript(text.trim()); setDone(r); onSaved(r); setText(""); }
    catch (ex) { setError(ex instanceof ApiError ? ex.message : "Could not save your voice entry."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">Talk instead of typing. ACIS saves only the <strong>text</strong>. The audio itself is never stored. It is added to your journal like any other entry.</p>
      <div className="flex flex-wrap gap-2">
        {recording ? <Button variant="danger" onClick={stop}><Square className="h-4 w-4" aria-hidden />Stop</Button> : (
          <>
            {serverStt && <Button onClick={recordAudio} disabled={busy}><Mic className="h-4 w-4" aria-hidden />Record and transcribe</Button>}
            {supported && <Button variant={serverStt ? "secondary" : "primary"} onClick={dictate} disabled={busy}><Mic className="h-4 w-4" aria-hidden />Dictate in browser</Button>}
          </>
        )}
        {recording && <span role="status" className="self-center text-sm font-medium text-danger">● Listening…</span>}
      </div>
      {!serverStt && !supported && <Notice tone="info">Voice input isn&apos;t available in this browser, so please type your entry below.</Notice>}
      {supported && <Notice tone="warn">Browser dictation may send your speech to your browser maker&apos;s speech service. If you&apos;d rather not, type instead.</Notice>}
      {status.error && <Notice tone="warn">Couldn&apos;t check whether server transcription is available. Typing still works.</Notice>}

      <form onSubmit={submit} noValidate className="space-y-3">
        <TextAreaField label="Your entry (edit it before saving)" rows={5} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" loading={busy}>Save as a journal entry</Button>
      </form>
      {done && <Notice tone="success">Saved. {done.detected.fields.length ? `ACIS noticed you mentioned: ${done.detected.fields.map((f) => f.replace(/_/g, " ")).join(", ")}.` : "No specific fields of study were mentioned."}</Notice>}
    </div>
  );
}
