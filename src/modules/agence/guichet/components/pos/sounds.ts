let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export type SoundType = "success" | "error" | "close" | "click";

/** Son Shopify (encaissement, preuve reçue) : public/splash/son.mp3 — si absent, fallback son synthétique */
const SUCCESS_SOUND_URL = "/splash/son.mp3";

function playSuccessSynthetic(ctx: AudioContext, t: number) {
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(1760, t);
  osc1.frequency.exponentialRampToValueAtTime(1320, t + 0.06);
  gain1.gain.setValueAtTime(0, t);
  gain1.gain.linearRampToValueAtTime(0.2, t + 0.02);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc1.start(t);
  osc1.stop(t + 0.1);

  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(880, t + 0.08);
  osc2.frequency.exponentialRampToValueAtTime(520, t + 0.22);
  gain2.gain.setValueAtTime(0, t + 0.08);
  gain2.gain.linearRampToValueAtTime(0.22, t + 0.1);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc2.start(t + 0.08);
  osc2.stop(t + 0.35);
}

export function playSound(type: SoundType) {
  try {
    if (type === "success") {
      const audio = new Audio(SUCCESS_SOUND_URL);
      let fallbackDone = false;
      const fallback = () => {
        if (fallbackDone) return;
        fallbackDone = true;
        try {
          const ctx = getCtx();
          playSuccessSynthetic(ctx, ctx.currentTime);
        } catch {
          /* ignore */
        }
      };
      audio.addEventListener("error", fallback);
      audio.play().catch(fallback);
      return;
    }

    const ctx = getCtx();
    const t = ctx.currentTime;

    switch (type) {
      case "error": {
        const o1 = ctx.createOscillator();
        const g1 = ctx.createGain();
        o1.connect(g1);
        g1.connect(ctx.destination);
        o1.type = "square";
        o1.frequency.setValueAtTime(200, t);
        o1.frequency.setValueAtTime(150, t + 0.1);
        g1.gain.setValueAtTime(0.12, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o1.start(t);
        o1.stop(t + 0.15);

        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.connect(g2);
        g2.connect(ctx.destination);
        o2.type = "square";
        o2.frequency.setValueAtTime(200, t + 0.18);
        o2.frequency.setValueAtTime(150, t + 0.28);
        g2.gain.setValueAtTime(0.12, t + 0.18);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o2.start(t + 0.18);
        o2.stop(t + 0.35);
        break;
      }
      case "close": {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(660, t);
        osc.frequency.linearRampToValueAtTime(440, t + 0.2);
        osc.frequency.linearRampToValueAtTime(330, t + 0.4);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t);
        osc.stop(t + 0.5);
        break;
      }
      case "click": {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(1000, t);
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.start(t);
        osc.stop(t + 0.05);
        break;
      }
    }
  } catch {
    /* silent fail */
  }
}
