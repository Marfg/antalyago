/**
 * adapters/boardSound.js
 *
 * Tahta sesleri — ses dosyası YOK, Web Audio ile anında üretilir:
 *   place()   taşın ahşaba oturması (kısa "tık" + alçak gövde sesi)
 *   capture() yakalanan taşların kalkışı (iki-üç hafif tıkırtı)
 *   reject()  yasak hamle (yumuşak, alçalan kısa ton)
 *
 * Varsayılan KAPALI. AudioContext yalnız setEnabled(true) ilk çağrıldığında
 * kurulur; tarayıcı onu askıda başlatırsa ilk kullanıcı dokunuşunda
 * unlock() ile sürdürülür. Ses API'si olmayan ortamlarda (Node testleri)
 * her çağrı sessizce no-op'tur.
 */
export function createBoardSound() {
  let enabled = false;
  let ac = null;
  let noise = null;

  function context() {
    if (ac) return ac;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    ac = new AC();
    // Bir kez üretilen kısa beyaz gürültü tamponu — tık seslerinin hammaddesi.
    noise = ac.createBuffer(1, Math.round(ac.sampleRate * 0.08), ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ac;
  }

  function ready() {
    if (!enabled) return null;
    const c = context();
    if (!c || c.state !== 'running') return null;
    return c;
  }

  function click(c, at, freq, gain, decay) {
    const src = c.createBufferSource(); src.buffer = noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(at); src.stop(at + decay + 0.01);
  }

  function tone(c, at, from, to, gain, dur) {
    const osc = c.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(c.destination);
    osc.start(at); osc.stop(at + dur + 0.01);
  }

  return {
    setEnabled(on) {
      enabled = !!on;
      if (enabled) context()?.resume?.().catch(() => {});
    },
    isEnabled() { return enabled; },
    /** Kullanıcı hareketi içinde çağrılır — askıdaki AudioContext'i sürdürür. */
    unlock() {
      if (enabled && ac && ac.state === 'suspended') ac.resume().catch(() => {});
    },
    place() {
      const c = ready(); if (!c) return;
      const t = c.currentTime;
      click(c, t, 2200, 0.5, 0.05);
      tone(c, t, 190, 120, 0.18, 0.09);
    },
    capture(count = 1) {
      const c = ready(); if (!c) return;
      const t = c.currentTime + 0.12;
      for (let i = 0; i < Math.min(3, Math.max(1, count)); i++) click(c, t + i * 0.06, 3200, 0.22, 0.035);
    },
    reject() {
      const c = ready(); if (!c) return;
      tone(c, c.currentTime, 240, 150, 0.12, 0.16);
    },
  };
}
