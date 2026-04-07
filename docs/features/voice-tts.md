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

## Voice Input (VAD + STT Fallback)

Voice input keeps the current low-latency mic and VU meter pipeline, but transcription is no longer tied only to the browser Web Speech API.

### Modes

| Mode | Behaviour |
|---|---|
| `auto` | uses browser speech recognition where reliable, otherwise falls back to sherpa-onnx websocket STT |
| `browser` | forces Web Speech API only |
| `server` | forces sherpa-onnx websocket STT even on Chrome |

Configured with:

```bash
VITE_AIR3_STT_PROVIDER=auto
VITE_AIR3_STT_WS_URL=/api/stt/ws
```

### Runtime flow

```
Browser microphone
      │
      ▼
AudioWorklet (workers/vad/process.worklet.js)
      │
      ├─ measures live volume → VU meter
      ├─ detects speech start / speech end
      └─ emits 16 kHz mono Float32 PCM chunks
             │
             ▼
        modules/hearing/pipeline.ts
             │
             ├─ browser mode:
             │    └─ Web Speech API continues to drive interim/final transcript
             │
             └─ server mode or fallback:
                  ├─ accumulates utterance PCM
                  ├─ encodes mono 16-bit WAV
                  ├─ hands WAV to serverStt.ts
                  └─ serverStt.ts replays official sherpa framing over websocket
                         │
                         ▼
                    /api/stt/ws
                         │
                         ▼
               sherpa-onnx offline websocket server
```

### Why the server path is utterance-based

The app does **not** stream every microphone frame to the backend in this first phase. Instead it:

1. starts the mic and VAD immediately
2. buffers only the current utterance while speech is detected
3. closes the utterance after silence
4. sends the completed utterance for transcription

This preserves the current UX and keeps resource usage low on browsers such as Opera or Phantom where browser STT is missing or unreliable.

### Recommended deployment setup

When the app is served over HTTPS, do **not** point the browser directly at `ws://192.168...`.
Prefer:

```bash
VITE_AIR3_STT_WS_URL=/api/stt/ws
AIRIFICA_STT_PROXY_TARGET_WS_URL=ws://192.168.178.87:6006
```

This keeps the browser same-origin while the local bridge proxies websocket traffic to sherpa on the LAN.

### Manual test checklist

- Chrome desktop, `VITE_AIR3_STT_PROVIDER=auto`
  - transcript populates live as before
  - composer sync works
  - auto-send works
- Chrome desktop, `VITE_AIR3_STT_PROVIDER=server`
  - VU meter still works
  - transcript arrives after each utterance via sherpa
  - auto-send still works
- Opera / Phantom / browsers without reliable Web Speech API
  - mic starts without immediate “browser unsupported” error
  - transcript arrives through server fallback
  - stop/start mic does not duplicate transcript or leave listening stuck

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
