<script setup lang="ts">
const props = defineProps<{
  open: boolean
  prompts?: readonly string[]
  showMentionNote?: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'select', prompt: string): void
}>()

const defaultPrompts = [
  '@tag_agent hi, who are you?',
  '@tag_agent what time is it in New York? And in Tokyo?',
  '@tag_agent give me $BTC fundamentals',
  '@tag_agent give me the price of $BTC',
  '@tag_agent give me a $BTC market analysis',
  '@tag_agent show me a $BTC chart',
  '@tag_agent give me fundamentals for 2jvsWRkT17ofmv9pkW7ofqAFWSCNyJYdykJ7kPKbmoon',
  '@tag_agent give me the price of 2jvsWRkT17ofmv9pkW7ofqAFWSCNyJYdykJ7kPKbmoon',
  '@tag_agent give me a market analysis for 2jvsWRkT17ofmv9pkW7ofqAFWSCNyJYdykJ7kPKbmoon',
  '@tag_agent show me a chart for 2jvsWRkT17ofmv9pkW7ofqAFWSCNyJYdykJ7kPKbmoon',
  '@tag_agent what is today’s boosted token?',
  '@tag_agent what is today’s new listing?',
  '@tag_agent what is the most mentioned ticker on X today?',
  '@tag_agent what is the market sentiment right now?',
  '@tag_agent what is total volume today?',
  '@tag_agent what is today’s trending token?',
]

const prompts = props.prompts?.length ? props.prompts : defaultPrompts

function handlePromptClick(prompt: string) {
  emit('select', prompt)
}
</script>

<template>
  <Transition name="surface-overlay">
    <div v-if="props.open" class="command-guide" @click.self="emit('close')">
      <div class="command-guide__panel">
        <div class="command-guide__header">
          <div>
            <p class="command-guide__eyebrow">
              Agent guide
            </p>
            <h2>Example use cases</h2>
            <p class="command-guide__copy">
              Here are sample prompts you can use with the agent.
            </p>
          </div>

          <button class="command-guide__close" type="button" aria-label="Close guide" @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div v-if="props.showMentionNote !== false" class="command-guide__note">
          Replace <code>@tag_agent</code> with the active mention tag when your channel requires one.
        </div>

        <div class="command-guide__list">
          <button
            v-for="prompt in prompts"
            :key="prompt"
            class="command-guide__item"
            type="button"
            @click="handlePromptClick(prompt)"
          >
            <span>{{ prompt }}</span>
            <span class="command-guide__hint">Use</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.command-guide {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(2, 12, 20, 0.72);
  backdrop-filter: blur(16px);
}

.surface-overlay-enter-active,
.surface-overlay-leave-active {
  transition: opacity 280ms ease, backdrop-filter 280ms ease, background-color 280ms ease;
}

.surface-overlay-enter-active .command-guide__panel,
.surface-overlay-leave-active .command-guide__panel {
  transition:
    opacity 320ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 320ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 320ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 320ms cubic-bezier(0.16, 1, 0.3, 1);
}

.surface-overlay-enter-from,
.surface-overlay-leave-to {
  opacity: 0;
  background: rgba(2, 12, 20, 0);
  backdrop-filter: blur(0px);
}

.surface-overlay-enter-from .command-guide__panel,
.surface-overlay-leave-to .command-guide__panel {
  opacity: 0;
  transform: translateY(28px) scale(0.92);
  filter: blur(1.4px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
}

.command-guide__panel {
  width: min(920px, calc(100vw - 32px));
  max-height: min(80dvh, 860px);
  overflow: auto;
  padding: 20px;
  border: 1px solid rgba(138, 218, 255, 0.14);
  border-radius: 28px;
  background: rgba(5, 20, 31, 0.94);
  box-shadow: 0 32px 96px rgba(0, 0, 0, 0.42);
}

.command-guide__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.command-guide__eyebrow {
  margin: 0 0 6px;
  color: rgba(186, 230, 253, 0.6);
  font-size: 11px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
}

.command-guide__header h2 {
  margin: 0;
  color: #f6fbff;
  font-size: 1.36rem;
}

.command-guide__copy,
.command-guide__note {
  margin: 10px 0 0;
  color: rgba(226, 241, 249, 0.68);
  font-size: 0.9rem;
  line-height: 1.6;
}

.command-guide__note {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(138, 218, 255, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.command-guide__note code {
  color: #f6fbff;
  font-family: inherit;
}

.command-guide__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(138, 218, 255, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  color: #d8eef7;
}

.command-guide__close svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.command-guide__list {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}

.command-guide__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid rgba(138, 218, 255, 0.08);
  border-radius: 18px;
  background: rgba(8, 28, 42, 0.52);
  color: #ecf6fb;
  font-size: 0.92rem;
  line-height: 1.5;
  text-align: left;
}

.command-guide__item:hover {
  border-color: rgba(255, 194, 56, 0.28);
  background: rgba(17, 35, 51, 0.72);
}

.command-guide__hint {
  flex: 0 0 auto;
  color: rgba(255, 219, 131, 0.84);
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

@media (max-width: 720px) {
  .command-guide {
    padding: 12px;
  }

  .command-guide__panel {
    width: calc(100vw - 24px);
    padding: 16px;
    border-radius: 24px;
  }

  .command-guide__item {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
