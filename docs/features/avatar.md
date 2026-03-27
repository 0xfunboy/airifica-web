# 3D Avatar System

The avatar system renders a real-time 3D VRM character using Three.js and the `@pixiv/three-vrm` library. The character (Bairbi) is displayed in a Three.js WebGL scene with dynamic lighting, facial expressions, lip-sync, and procedural animations.

---

## Architecture

```
AvatarStageCard.vue
  └─ @airifica/avatar3d (workspace package)
       └─ AvatarStage.vue
            ├─ Three.js WebGLRenderer
            ├─ VRM loader (@pixiv/three-vrm)
            ├─ VRMA animation loader (@pixiv/three-vrm-animation)
            └─ modules/avatar/
                 ├─ presence.ts    → camera, avatar position
                 ├─ vrma.ts        → animation clips
                 ├─ lighting.ts    → Three.js lighting rig
                 └─ emoteDebug.ts  → dev expression tools
```

---

## VRM Model

The default model is `AIR3_Dress_Final.vrm`, served from `/brand/AIR3_Dress_Final.vrm`.

A custom model can be provided via environment variable:

```bash
VITE_AIRIFICA_AVATAR_MODEL_URL=/brand/my-custom-model.vrm
```

The model supports:
- **BlendShapes** — facial expressions (joy, sad, angry, neutral, surprised)
- **Visemes** — mouth shapes for lip-sync (A, I, U, E, O + consonant variants)
- **Bone animation** — idle breathing, gesture playback via VRMA clips
- **MToon shader** — cel-shaded anime rendering (built into `@pixiv/three-vrm`)

---

## Animation Clips (VRMA)

Animation clips are stored in `public/vrm-animations/` and loaded at runtime:

| Animation | File | Description |
|---|---|---|
| Breath (idle) | `breath.vrma` | Subtle breathing loop |
| No anim | `no-anim.vrma` | Static pose (T-pose reset) |
| Talk gesture 1 | _(various)_ | Hand gesture during speech |
| Talk gesture 2 | _(various)_ | Alternative speech gesture |
| Bow | _(various)_ | Greeting animation |

The `@airifica/avatar3d` package exports the canonical animation URL list:

```typescript
import { animationUrls, BREATH_URL, NO_ANIM_URL } from '@airifica/avatar3d'
```

---

## Lighting Rig

The Three.js scene uses a multi-light setup, fully configurable via environment variables:

```
┌─────────────────────────────────┐
│         Three.js Scene          │
│                                 │
│  AmbientLight (default: 0.00)   │ ← fills shadows
│  HemisphereLight (0.50)         │ ← sky/ground gradient
│  DirectionalLight "key" (2.60)  │ ← main front light
│  DirectionalLight "fill" (1.20) │ ← side fill
│  DirectionalLight "rim" (0.00)  │ ← back rim (off by default)
│                                 │
│  Post-processing:               │
│    brightness: 0.80             │
│    contrast:   1.05             │
│    saturation: 1.50             │
│    exposure:   0.80             │
└─────────────────────────────────┘
```

Adjust lighting in `.env.local`:

```bash
VITE_AIR3_STAGE_KEY_INTENSITY=3.0
VITE_AIR3_STAGE_RIM_INTENSITY=0.5
```

---

## Facial Expressions

Bairbi transitions between expressions based on conversation context:

| Expression | Trigger |
|---|---|
| `neutral` | Default idle state |
| `joy` | Positive/bullish AI response |
| `sad` | Negative/loss-related content |
| `angry` | Strong bearish signal |
| `surprised` | Unexpected market move |

Expressions are set via VRM BlendShape API and transition with a lerp for smooth animation.

---

## Lip Sync

When TTS audio plays, phonemes are extracted and mapped to VRM mouth shapes (visemes):

```
AI text response
      │
      ▼
TTS backend (/api/tts/phonemes)
      │  Returns: [{ phoneme: "AH", start: 0.1, end: 0.25 }, ...]
      ▼
modules/speech/visemes.ts
      │  Maps phoneme → VRM BlendShape key
      ▼
AvatarStage.vue
      │  Sets blendShape weight on each animation frame
      ▼
Bairbi speaks with synchronized mouth movement
```

### Phoneme → Viseme Mapping

| Phoneme Group | Viseme |
|---|---|
| AH, AA, AW | `aa` (wide open) |
| EH, EY, AE | `ee` |
| IH, IY | `ih` |
| OH, OW, AO | `oh` |
| UH, UW | `ou` |
| Consonants | `neutral` or brief closure |

---

## Stage Backdrop

`StageBackdrop.vue` renders the background image (`AIR3-extended-Studio.webp`) behind the Three.js canvas. The backdrop uses CSS `object-fit: cover` and a slight dark overlay to make the avatar pop.

---

## Performance Notes

- The Three.js scene renders at native display resolution
- VRM model loading is async; a loading indicator shows until ready
- Animation update loop uses `requestAnimationFrame`
- The VRM chunk (~2MB) is code-split from the main bundle and loaded lazily
- On mobile, the avatar section collapses to a smaller height to prioritize the chat interface
