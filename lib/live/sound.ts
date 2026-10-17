// A beep per correct rep and the warning spoken through the browser speech API, with a
// mute toggle. unlock() must run inside a user gesture, or browsers keep audio silent.
let ctx: AudioContext | null = null;

// One phrase at a time: a new phrase waits for the current one to finish (only the latest
// waits, and is dropped once it has waited STALE_MS, since the moment has passed), and the
// same phrase is not repeated within REPEAT_MS.
const RATE = 0.95;
const GAP_MS = 300;
const REPEAT_MS = 3000;
const STALE_MS = 1500;
let pending: { text: string; at: number } | null = null;
let last = { text: "", at: 0 };

// After any utterance ends, the phrase that waited is spoken.
const drain = () =>
  setTimeout(() => {
    const next = pending;
    pending = null;
    if (next && !sound.muted && Date.now() - next.at <= STALE_MS) speakNow(next.text);
  }, GAP_MS);

function speakNow(text: string) {
  last = { text, at: Date.now() };
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = RATE;
  utterance.onend = drain;
  utterance.onerror = drain;
  speechSynthesis.speak(utterance);
}

export const sound = {
  muted: false,

  unlock() {
    if (typeof AudioContext === "undefined") return;
    ctx ??= new AudioContext();
    void ctx.resume();
    if (!("speechSynthesis" in window)) return;
    // iOS Safari speaks nothing until one speak() runs inside a tap; a silent one unlocks it.
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    silent.onend = drain;
    speechSynthesis.speak(silent);
  },

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted && "speechSynthesis" in window) {
      pending = null;
      speechSynthesis.cancel();
    }
  },

  beep(seconds = 0.12, hz = 880) {
    if (this.muted || !ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = hz;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
    osc.stop(ctx.currentTime + seconds);
  },

  say(text: string) {
    if (this.muted || !("speechSynthesis" in window)) return;
    if (text === last.text && Date.now() - last.at < REPEAT_MS) return;
    if (speechSynthesis.speaking || speechSynthesis.pending) pending = { text, at: Date.now() };
    else speakNow(text);
  },
};
