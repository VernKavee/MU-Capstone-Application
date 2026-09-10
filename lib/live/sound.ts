// A beep per correct rep and the warning spoken through the browser speech API, with a
// mute toggle. unlock() must run inside a user gesture, or browsers keep audio silent.
let ctx: AudioContext | null = null;

export const sound = {
  muted: false,

  unlock() {
    if (typeof AudioContext === "undefined") return;
    ctx ??= new AudioContext();
    void ctx.resume();
    if ("speechSynthesis" in window) speechSynthesis.getVoices();
  },

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted && "speechSynthesis" in window) speechSynthesis.cancel();
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
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    speechSynthesis.speak(utterance);
  },
};
