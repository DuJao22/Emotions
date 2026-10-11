export class ShowreelAudioSynth {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private adest: MediaStreamAudioDestinationNode | null = null;
  private nbuf: AudioBuffer | null = null;
  private muted = false;

  public init() {
    if (this.ac) return;
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ac = new AudioCtx();
    this.master = this.ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.adest = this.ac.createMediaStreamDestination();
    this.master.connect(this.ac.destination);
    this.master.connect(this.adest);

    this.nbuf = this.ac.createBuffer(1, this.ac.sampleRate, this.ac.sampleRate);
    const d = this.nbuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = Math.random() * 2 - 1;
    }
  }

  public async resume() {
    this.init();
    if (this.ac && this.ac.state === 'suspended') {
      try {
        await this.ac.resume();
      } catch {
        // Ignore autoplay restriction errors until user gesture
      }
    }
  }

  public setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ac) {
      this.master.gain.setValueAtTime(this.muted ? 0 : 0.8, this.ac.currentTime);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getAudioTracks(): MediaStreamTrack[] {
    this.init();
    return this.adest ? this.adest.stream.getAudioTracks() : [];
  }

  public kick() {
    if (!this.ac || !this.master) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }

  public hat() {
    if (!this.ac || !this.master || !this.nbuf) return;
    const t = this.ac.currentTime;
    const s = this.ac.createBufferSource();
    const f = this.ac.createBiquadFilter();
    const g = this.ac.createGain();
    s.buffer = this.nbuf;
    f.type = 'highpass';
    f.frequency.value = 7000;
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.06);
  }

  public whoosh() {
    if (!this.ac || !this.master || !this.nbuf) return;
    const t = this.ac.currentTime;
    const s = this.ac.createBufferSource();
    const f = this.ac.createBiquadFilter();
    const g = this.ac.createGain();
    s.buffer = this.nbuf;
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3500, t + 0.3);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + 0.4);
  }
}
