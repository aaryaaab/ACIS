/** Browser dictation (Web Speech API). Availability and privacy depend on the browser. */
type Rec = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null; start(): void; stop(): void };

export function dictationSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function startDictation(onText: (finalText: string) => void, onEnd: (error?: string) => void): { stop: () => void } {
  const w = window as unknown as Record<string, new () => Rec>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  const rec = new Ctor();
  rec.lang = "en-IN";
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = (e) => {
    let text = "";
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript + " ";
    if (text) onText(text.trim());
  };
  rec.onerror = (e) => onEnd(e?.error === "not-allowed" ? "Microphone access was blocked. Allow it in your browser, or type instead." : "Speech recognition stopped. You can type instead.");
  rec.onend = () => onEnd();
  rec.start();
  return { stop: () => rec.stop() };
}
