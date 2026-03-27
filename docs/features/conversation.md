# Conversation Interface

The conversation interface is the primary interaction layer. Users type messages, the AI responds with text and optional trade proposals, and the avatar narrates the response aloud.

---

## Components

| Component | File | Role |
|---|---|---|
| `ConversationCard` | `src/components/ConversationCard.vue` | Main chat container, input area |
| `ConversationMessageItem` | `src/components/ConversationMessageItem.vue` | Single message bubble |
| `TradeProposalCard` | `src/components/TradeProposalCard.vue` | Embedded trade proposal |

---

## State: `useConversation()`

Located in `src/modules/conversation/state.ts`.

```typescript
const {
  messages,      // ConversationMessage[] — reactive array
  isPending,     // boolean — waiting for AI response
  conversationId, // string | null — session ID from elizaOS
  send,          // (text: string) => Promise<void>
  loadHistory,   // () => Promise<void>
} = useConversation()
```

### Message Flow

```
1. User submits message
   └─ send(text) called

2. Optimistic message added to messages[]
   └─ { role: 'user', content: text, pending: false }

3. isPending = true (shows loading indicator)

4. POST /api/airi3/message
   └─ air3Client.sendMessage(text, conversationId)

5. Response arrives (Air3MessageEnvelope)
   ├─ conversationId updated if new session
   ├─ AI message added: { role: 'assistant', content, proposal? }
   └─ isPending = false

6. TTS synthesis triggered on AI message content
```

---

## Message Types

```typescript
interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  conversationId?: string
  action?: string           // AI action tag (e.g., 'TRADE_PROPOSAL')
  image?: string            // Optional image URL
  proposal?: Air3TradeProposal  // Embedded trade proposal
  proposalPending?: boolean
  meta?: Air3MessageMeta    // { source, provider }
  pending?: boolean         // Optimistic state
  statusNote?: string       // Loading status text
}
```

---

## Example Messages

`src/modules/conversation/examples.ts` provides contextual starter prompts displayed when the conversation is empty:

```
"What's the current setup on SOL?"
"Should I add to my position?"
"Give me a BTC trade for today"
"What's the R/R on a long here?"
"Check my account and suggest a size"
```

These adapt to the current market symbol.

---

## Session Persistence

The `conversationId` is the elizaOS session identifier. It is stored in component state (not localStorage), meaning it resets on page reload. On reload, `loadHistory()` can recover the conversation from the elizaOS backend using the stored session token.

For guest users (no wallet), sessions are ephemeral.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `Shift + Enter` | New line in input |
| `↑` | Edit last sent message |

---

## Message Rendering

Each message is rendered by `ConversationMessageItem.vue`:

- **User messages**: right-aligned, dark background
- **Assistant messages**: left-aligned, with avatar icon
- **System messages**: centered, muted style
- **Proposals**: `TradeProposalCard` rendered inline below the message text
- **Images**: rendered as inline image (for future chart attachment feature)
- **Loading**: animated dots while `isPending`

---

## Trade Proposals in Chat

When the AI generates a trade proposal, it is embedded directly in the assistant message:

```
╔══════════════════════════════════════╗
║  $SOL  1H  LONG  R/R: 1.77  68%     ║
║  Entry: 90 │ TP: 95.5 │ SL: 86.9   ║
║  Size: 0.22 SOL │ 20x leverage      ║
║  ─────────────────────────────────  ║
║  [  Execute trade  ]                ║
╚══════════════════════════════════════╝
```

The Execute button triggers `product/execution.ts` → `POST /api/airi3/pacifica/execute`.
