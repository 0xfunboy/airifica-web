# Voice & Text-to-Speech

AIR3 Agent narrates every AI response through a text-to-speech pipeline. The audio is synchronized with the avatar's mouth movements (lip-sync) using phoneme-to-viseme mapping.

---

## Architecture

```
AI text response
      │
      ▼
modules/speech/runtime.ts
      │
      ├─ Split long text into chunks (120 chars default)
      │
      ├─ For each chunk:
      │    ├─ POST /api/tts               → audio stream (PCM/WAV)
      │    └─ POST /api/tts/phonemes     → phoneme timestamps
      │
      ├─ Queue audio chunks
      │    └─ Web Audio API → PCM stream → AudioContext
      │
      └─ Sync phonemes with audio playback
           └─ modules/speech/visemes.ts
                └─ Set VRM blendShape weights per frame
                     └─ Avatar mouth moves in sync
```

---

## TTS Providers

| Provider | Description |
|---|---|
| `browser` | Uses the browser's built-in `SpeechSynthesis` API — no backend needed, no lip-sync |
| `openai-compatible` | Calls `/api/tts` → TTS proxy → Kokoro or any OpenAI-compatible backend — supports lip-sync |

Set via:

```bash
VITE_AIR3_TTS_PROVIDER=openai-compatible
```

---

## PCM Streaming

For low-latency audio, the TTS backend returns raw **PCM audio** in chunks:

| Parameter | Value |
|---|---|
| Format | `pcm` (16-bit signed, little-endian) |
| Sample rate | 24,000 Hz |
| Channels | Mono |
| Chunk duration | 180ms |

The browser plays each chunk as it arrives using the Web Audio API, without waiting for the full file to download. This means audio starts playing within ~200ms of the TTS request.

---

## Text Splitting

Long responses are split into chunks before being sent to TTS:

```typescript
// VITE_AIR3_TTS_SPLIT_TEXT=true
// VITE_AIR3_TTS_CHUNK_SIZE=120

"The SOL chart is showing a bullish flag pattern on the 15m..."
→ chunk 1: "The SOL chart is showing a bullish flag pattern on the 15m"
→ chunk 2: "with strong volume on the breakout. I'd target the..."
```

Splitting at sentence boundaries (`.`, `!`, `?`) when possible. This reduces first-audio latency since chunk 1 starts playing while chunk 2 is still being synthesized.

---

## Lip Sync Pipeline

### 1. Phoneme Extraction

```
POST /api/tts/phonemes
Body: { text: "Hello, I see SOL breaking out...", voice: "af_heart" }

Response:
[
  { phoneme: "HH", start: 0.0,  end: 0.08 },
  { phoneme: "AH", start: 0.08, end: 0.18 },
  { phoneme: "L",  start: 0.18, end: 0.25 },
  ...
]
```

### 2. Viseme Mapping

`modules/speech/visemes.ts` maps IPA phonemes to VRM viseme keys:

```typescript
const PHONEME_TO_VISEME: Record<string, string> = {
  // Vowels
  'AA': 'aa', 'AH': 'aa', 'AW': 'aa',
  'EH': 'ee', 'EY': 'ee', 'AE': 'ee',
  'IH': 'ih', 'IY': 'ih',
  'OH': 'oh', 'OW': 'oh', 'AO': 'oh',
  'UH': 'ou', 'UW': 'ou',
  // Consonants → brief mouth shapes
  'P': 'pp', 'B': 'pp', 'M': 'pp',
  'F': 'ff', 'V': 'ff',
  'TH': 'th',
  'DD': 'dd', 'T': 'dd',
  // Default
  '_': 'sil',  // silence
}
```

### 3. Real-Time Blending

During audio playback, a `requestAnimationFrame` loop reads the current audio timestamp and looks up the active phoneme. The corresponding VRM blendshape weight is lerped to avoid abrupt transitions:

```
currentTime: 0.12s → phoneme "AH" → viseme "aa" → weight: 0.85
currentTime: 0.19s → phoneme "L"  → viseme "dd" → weight: 0.40
```

---

## Voice Configuration

```bash
# Kokoro voice preset
VITE_AIR3_TTS_VOICE=af_heart

# Playback speed (1.0 = normal, 1.2 = 20% faster)
VITE_AIR3_TTS_SPEED_FACTOR=1

# Phoneme language (affects phoneme extraction algorithm)
VITE_AIR3_TTS_PHONEME_LANGUAGE=a
```

Available Kokoro voices (examples):
- `af_heart` — warm female voice (default)
- `af_bella` — bright female voice
- `am_adam` — male voice
- `bf_emma` — British female

---

## Voice Input (VAD)

In addition to TTS output, users can speak to Bairbi directly. Voice input uses the **Web Audio API** with a **Voice Activity Detection (VAD) Web Worker**:

```
Browser microphone
      │
      ▼
AudioWorklet (workers/vad/process.worklet.ts)
      │  Runs in separate thread for non-blocking audio processing
      ├─ Detects speech start (VAD threshold)
      ├─ Buffers audio while speaking
      └─ Detects speech end (silence timeout)
             │
             ▼
        modules/hearing/pipeline.ts
             │  Assembles audio buffer
             └─ Sends to Web Speech API or Whisper endpoint for STT
                    │
                    ▼
               ConversationCard
                    │
                    └─ Inserts transcribed text → sends as message
```

Voice input is toggled via the microphone button in `StageFooter.vue`.

---

## Audio Session Management

`modules/audio/session.ts` manages the `AudioContext` lifecycle. Web browsers require user gesture before creating an AudioContext — the first user click or tap initializes it.

```typescript
const { audioContext, ensureReady } = useAudioSession()

// Call before any audio operation
await ensureReady()  // creates AudioContext if not yet created
```

---

## Lip-Sync Profile

`modules/speech/assets/lip-sync-profile.json` contains the timing calibration profile for the specific VRM model — fine-tuned blendshape weight curves for each viseme to match Bairbi's facial rig.
