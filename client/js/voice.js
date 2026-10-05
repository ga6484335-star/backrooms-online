// ============================================================================
// VOICE — spoken dialogue for cinematics and story beats.
//
// The game ships no audio files, so the character's voice is synthesized with
// the Web Speech API. Each line carries a `mood` that colours rate/pitch so the
// same engine can play a calm walk home, a whisper, or a panicked fall. When
// speech synthesis is unavailable (older browsers, headless test runs, muted
// devices) it degrades gracefully: an eerie radio-static / whisper texture is
// played instead, so a cinematic is never silent and subtitles always carry the
// words.
//
// Purely local, purely presentational: nothing here touches the network or the
// deterministic world, so it is safe in co-op (each client voices its own
// script and never desyncs a room).
// ============================================================================

// Mood -> prosody. `speaker` is the on-screen attribution for subtitles.
const MOODS = {
  default: { rate: 0.95, pitch: 1.0, volume: 1.0, speaker: 'INNER VOICE' },
  calm: { rate: 0.97, pitch: 1.02, volume: 1.0, speaker: 'INNER VOICE' },
  tired: { rate: 0.86, pitch: 0.93, volume: 1.0, speaker: 'INNER VOICE' },
  uneasy: { rate: 0.98, pitch: 0.99, volume: 1.0, speaker: 'INNER VOICE' },
  dread: { rate: 0.8, pitch: 0.84, volume: 1.0, speaker: 'INNER VOICE' },
  whisper: { rate: 0.84, pitch: 0.78, volume: 0.55, speaker: 'A WHISPER' },
  radio: { rate: 1.0, pitch: 0.9, volume: 0.9, speaker: 'RADIO' },
  machine: { rate: 0.7, pitch: 0.55, volume: 0.9, speaker: 'THE ARCHIVIST' },
};

// Strip typography the synthesizer would mispronounce, and turn an ALL-CAPS
// script back into natural speech. Acronyms like "REC" are left alone.
function toSpeech(text) {
  return String(text || '')
    .replace(/[—–]/g, ', ')
    .replace(/…/g, '...')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class VoiceEngine {
  constructor(audio) {
    this.audio = audio || null;
    this.enabled = true;                 // toggled from settings (VOICE)
    this.supported = typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && typeof window.SpeechSynthesisUtterance !== 'undefined';
    this.voice = null;
    this._voices = [];
    this._speaking = false;
    this._current = null;
    this._gen = 0;                 // bumped on every stop/speak so stale
                                   // utterance callbacks from a cancelled line
                                   // are ignored (cancel() can fire onerror)
    this.mood = 'default';
    if (this.supported) {
      this._loadVoices();
      // voice lists are populated asynchronously on most browsers
      try { window.speechSynthesis.onvoiceschanged = () => this._loadVoices(); } catch (e) { /* ignore */ }
    }
  }

  _loadVoices() {
    try {
      const list = window.speechSynthesis.getVoices() || [];
      if (!list.length) return;
      this._voices = list;
      // prefer a British/English male-ish narrator; fall back to any en voice
      this.voice =
        list.find((v) => /en-GB/i.test(v.lang) && /male|daniel|george|arthur/i.test(v.name)) ||
        list.find((v) => /en-GB/i.test(v.lang)) ||
        list.find((v) => /en-US/i.test(v.lang) && /male|david|alex|fred/i.test(v.name)) ||
        list.find((v) => /^en/i.test(v.lang)) ||
        list[0] || null;
    } catch (e) { /* leave voice null */ }
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this.stop();
  }

  get speaking() { return this._speaking; }

  // Speak one line. Returns true if a real synthesizer utterance was queued,
  // false if we fell back to (or skipped) the texture/silence path.
  speak(text, opts = {}) {
    const clean = toSpeech(text);
    if (!clean) { if (opts.onEnd) opts.onEnd(); return false; }
    const mood = MOODS[opts.mood] || MOODS.default;
    this.mood = opts.mood || 'default';

    // interrupt whatever the previous line was doing so cues never stack
    this.stop();

    if (!this.enabled || !this.supported) {
      this._texture(opts.mood, opts.onEnd);
      return false;
    }

    let u;
    try {
      u = new window.SpeechSynthesisUtterance(clean);
    } catch (e) {
      this._texture(opts.mood, opts.onEnd);
      return false;
    }
    if (this.voice) u.voice = this.voice;
    u.rate = opts.rate || mood.rate;
    u.pitch = opts.pitch || mood.pitch;
    u.volume = opts.volume !== undefined ? opts.volume : mood.volume;
    const gen = this._gen;
    u.onstart = () => { if (gen !== this._gen) return; this._speaking = true; };
    u.onend = () => {
      if (gen !== this._gen) return;
      this._speaking = false; this._current = null;
      if (opts.onEnd) opts.onEnd();
    };
    u.onerror = () => {
      if (gen !== this._gen) return; // a cancelled predecessor, not this line
      this._speaking = false; this._current = null;
      this._texture(opts.mood, opts.onEnd);
    };
    this._current = u;
    try {
      window.speechSynthesis.speak(u);
    } catch (e) {
      this._texture(opts.mood, opts.onEnd);
      return false;
    }
    return true;
  }

  // Fallback texture when speech is unavailable: a quiet radio hiss or a
  // breath-like whisper, so the cinematic still has a voice-shaped sound.
  _texture(mood, onEnd) {
    const a = this.audio;
    if (!a) { if (onEnd) onEnd(); return; }
    try {
      if (mood === 'radio') a.radioStatic(1.6);
      else if (mood === 'whisper') a.whisper(1.8);
      else if (mood === 'machine') a.radioStatic(2.2);
      else a.whisper(1.0);
    } catch (e) { /* audio must never break the cinematic */ }
    if (onEnd) onEnd();
  }

  speakerFor(mood) { return (MOODS[mood] || MOODS.default).speaker; }

  stop() {
    this._speaking = false;
    this._current = null;
    this._gen++;
    if (this.supported) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
  }
}
