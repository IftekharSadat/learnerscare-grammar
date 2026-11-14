/** Microphone level meter + calibration. Audio is analysed in memory and never stored or uploaded by this module. */
export interface Calibration { noise: number; speech: number; verdict: 'good' | 'quiet' | 'noisy'; advice: string }

export class MicMeter {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  level = 0;
  peak = 0;

  static isSupported() { return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia; }

  /** Opens the microphone. Must be called from a user gesture. Throws when permission is denied. */
  async open(onLevel?: (level: number) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    const buf = new Float32Array(this.analyser.fftSize);
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      this.level = Math.min(1, Math.sqrt(sum / buf.length) * 6);
      this.peak = Math.max(this.peak, this.level);
      onLevel?.(this.level);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
    navigator.mediaDevices.addEventListener?.('devicechange', this.onDeviceChange);
  }
  onDeviceChange = () => { /* the next open() picks up the new default device */ };

  /** Sample for `ms`: the quietest 20 % is the room noise, the loudest 20 % is the voice. */
  async calibrate(ms = 5000): Promise<Calibration> {
    const samples: number[] = [];
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const id = setInterval(() => { samples.push(this.level); if (performance.now() - t0 >= ms) { clearInterval(id); resolve(); } }, 50);
    });
    return judgeCalibration(samples);
  }

  close() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.onDeviceChange);
    this.stream = null; this.ctx = null; this.analyser = null;
  }
}

export function judgeCalibration(samples: number[]): Calibration {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const k = Math.max(1, Math.floor(sorted.length / 5));
  const noise = mean(sorted.slice(0, k));
  const speech = mean(sorted.slice(-k));
  if (speech < 0.06) return { noise, speech, verdict: 'quiet', advice: 'I can hardly hear you. Move closer to the microphone or speak a little louder.' };
  if (noise > 0.12 || speech < noise * 2.2) return { noise, speech, verdict: 'noisy', advice: 'It is quite noisy here. Headphones with a microphone, or a quieter room, will help.' };
  return { noise, speech, verdict: 'good', advice: 'Loud and clear. You are ready.' };
}
