export class ShowreelAudioSynth {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private beatGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private adest: MediaStreamAudioDestinationNode | null = null;
  private nbuf: AudioBuffer | null = null;
  private muted = false;
  private voiceEnabled = true;
  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private decodedCache = new Map<string, AudioBuffer>();

  public init() {
    if (this.ac) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ac = new AudioCtx();
    this.master = this.ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;

    this.beatGain = this.ac.createGain();
    this.beatGain.gain.value = 0.32; // Batida mais suave para destacar a voz narradora

    this.voiceGain = this.ac.createGain();
    this.voiceGain.gain.value = 1.0;

    this.adest = this.ac.createMediaStreamDestination();
    this.beatGain.connect(this.master);
    this.voiceGain.connect(this.master);
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
      this.master.gain.setValueAtTime(this.muted ? 0 : 0.9, this.ac.currentTime);
    }
    if (m) {
      this.stopVoice();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setVoiceEnabled(v: boolean) {
    this.voiceEnabled = v;
    if (!v) {
      this.stopVoice();
    }
  }

  public isVoiceEnabled(): boolean {
    return this.voiceEnabled;
  }

  public stopVoice() {
    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.stop();
        this.activeVoiceSource.disconnect();
      } catch {
        // ignore
      }
      this.activeVoiceSource = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

  public async decodeBase64Audio(
    base64Data: string,
    mimeType = 'audio/wav'
  ): Promise<AudioBuffer | null> {
    this.init();
    if (!this.ac || !base64Data) return null;

    const cacheKey = base64Data.slice(0, 64) + '_' + base64Data.length;
    const cached = this.decodedCache.get(cacheKey);
    if (cached) return cached;

    try {
      const binary = atob(base64Data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Check if it has a RIFF/WAV header or standard encoded audio
      const isRiffWav =
        len > 44 &&
        bytes[0] === 0x52 && // 'R'
        bytes[1] === 0x49 && // 'I'
        bytes[2] === 0x46 && // 'F'
        bytes[3] === 0x46; // 'F'

      if (isRiffWav || (!mimeType.toLowerCase().includes('l16') && !mimeType.toLowerCase().includes('pcm'))) {
        try {
          const copyBuf = bytes.buffer.slice(0);
          const decoded = await this.ac.decodeAudioData(copyBuf);
          this.decodedCache.set(cacheKey, decoded);
          return decoded;
        } catch {
          // Fall through to raw L16 PCM 24kHz decoder if decodeAudioData fails
        }
      }

      // Raw 16-bit little-endian PCM at 24000 Hz (used by Gemini TTS L16 responses)
      const sampleRate = 24000;
      const numSamples = Math.floor(len / 2);
      const audioBuf = this.ac.createBuffer(1, numSamples, sampleRate);
      const channel = audioBuf.getChannelData(0);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < numSamples; i++) {
        const int16 = view.getInt16(i * 2, true);
        channel[i] = int16 / 32768;
      }
      this.decodedCache.set(cacheKey, audioBuf);
      return audioBuf;
    } catch {
      return null;
    }
  }

  public async speakScene(options: {
    text: string;
    sceneDuration: number;
    voiceAudioBase64?: string;
    voiceMimeType?: string;
  }) {
    if (this.muted || !this.voiceEnabled) return;
    const { text, sceneDuration, voiceAudioBase64, voiceMimeType } = options;
    const cleanText = String(text || '').trim();
    if (!cleanText) return;

    this.stopVoice();
    this.init();

    // 1. Se houver áudio neural da Gemini TTS para a cena, toca pelo AudioContext (entra na gravação de vídeo!)
    if (voiceAudioBase64 && this.ac && this.voiceGain) {
      const buf = await this.decodeBase64Audio(voiceAudioBase64, voiceMimeType);
      if (buf && this.ac && this.voiceGain) {
        const src = this.ac.createBufferSource();
        src.buffer = buf;
        // Ajusta levemente a velocidade caso o áudio seja maior que a duração da cena
        if (buf.duration > sceneDuration * 0.94 && sceneDuration > 1.2) {
          src.playbackRate.value = Math.min(1.35, buf.duration / (sceneDuration * 0.9));
        }
        src.connect(this.voiceGain);
        this.activeVoiceSource = src;
        src.start(0);
        return;
      }
    }

    // 2. Fallback imediato de zero latência via Web Speech API em Português
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const utter = new SpeechSynthesisUtterance(cleanText);
        utter.lang = 'pt-BR';
        const wordsCount = cleanText.split(/\s+/).length;
        const estimatedSec = wordsCount / 2.6;
        utter.rate =
          estimatedSec > sceneDuration * 0.85
            ? Math.min(1.45, Math.max(1.05, estimatedSec / (sceneDuration * 0.82)))
            : 1.08;
        utter.pitch = 1.0;
        utter.volume = 1.0;

        const voices = window.speechSynthesis.getVoices();
        const ptVoice =
          voices.find(
            (v) =>
              v.lang.toLowerCase().includes('pt-br') &&
              (v.name.toLowerCase().includes('natural') ||
                v.name.toLowerCase().includes('google') ||
                v.name.toLowerCase().includes('luciana') ||
                v.name.toLowerCase().includes('francisca') ||
                v.name.toLowerCase().includes('antonio'))
          ) || voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
        if (ptVoice) {
          utter.voice = ptVoice;
        }
        window.speechSynthesis.speak(utter);
      } catch {
        // ignore speech synthesis errors
      }
    }
  }

  public getAudioTracks(): MediaStreamTrack[] {
    this.init();
    return this.adest ? this.adest.stream.getAudioTracks() : [];
  }

  public kick() {
    if (!this.ac || !this.beatGain || this.muted) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g);
    g.connect(this.beatGain);
    o.start(t);
    o.stop(t + 0.28);
  }

  public hat() {
    if (!this.ac || !this.beatGain || !this.nbuf || this.muted) return;
    const t = this.ac.currentTime;
    const s = this.ac.createBufferSource();
    const f = this.ac.createBiquadFilter();
    const g = this.ac.createGain();
    s.buffer = this.nbuf;
    f.type = 'highpass';
    f.frequency.value = 7000;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f);
    s.connect(g);
    g.connect(this.beatGain);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.06);
  }

  public whoosh() {
    if (!this.ac || !this.beatGain || !this.nbuf || this.muted) return;
    const t = this.ac.currentTime;
    const s = this.ac.createBufferSource();
    const f = this.ac.createBiquadFilter();
    const g = this.ac.createGain();
    s.buffer = this.nbuf;
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.26);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    s.connect(f);
    f.connect(g);
    g.connect(this.beatGain);
    s.start(t);
    s.stop(t + 0.34);
  }
}
