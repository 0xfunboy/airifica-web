<script setup lang="ts">
import { computed } from 'vue'

import { truncateMiddle } from '@/lib/format'
import { useWalletSession } from '@/modules/wallet/session'

const wallet = useWalletSession()

const headerEntries = computed(() =>
  Object.entries(wallet.buildRequestHeaders()),
)

const actionBusy = computed(() => wallet.connecting.value || wallet.authenticating.value)

async function handleConnect() {
  try {
    await wallet.connect()
  }
  catch {
  }
}

async function handleAuthenticate() {
  try {
    await wallet.authenticate()
  }
  catch {
  }
}

async function handleDisconnect() {
  await wallet.disconnect()
}
</script>

<template>
  <section class="panel wallet-card">
    <div class="wallet-card__header">
      <div>
        <p class="eyebrow">
          Wallet session
        </p>
        <h2>Solana identity</h2>
      </div>
      <span :class="['wallet-card__state', wallet.isAuthenticated.value ? 'wallet-card__state--ready' : '']">
        {{ wallet.isAuthenticated.value ? 'verified' : wallet.isConnected.value ? 'connected' : 'guest' }}
      </span>
    </div>

    <div class="wallet-card__meta-grid">
      <article class="wallet-card__metric">
        <span>Session identity</span>
        <strong>{{ truncateMiddle(wallet.sessionIdentity.value, 26) }}</strong>
      </article>
      <article class="wallet-card__metric">
        <span>Wallet</span>
        <strong>{{ wallet.shortAddress.value || 'not connected' }}</strong>
      </article>
      <article class="wallet-card__metric">
        <span>Provider</span>
        <strong>{{ wallet.hasWalletProvider.value ? 'available' : 'missing' }}</strong>
      </article>
      <article class="wallet-card__metric">
        <span>Mode</span>
        <strong>{{ wallet.embedded.value ? 'embedded' : 'browser' }}</strong>
      </article>
    </div>

    <div class="wallet-card__actions">
      <button class="action-button action-button--primary" :disabled="actionBusy" @click="handleConnect">
        {{ wallet.connecting.value ? 'Connecting...' : wallet.isConnected.value ? 'Reconnect' : 'Connect wallet' }}
      </button>
      <button
        class="action-button action-button--secondary"
        :disabled="actionBusy || !wallet.isConnected.value || wallet.isAuthenticated.value"
        @click="handleAuthenticate"
      >
        {{ wallet.authenticating.value ? 'Verifying...' : 'Sign challenge' }}
      </button>
      <button class="action-button action-button--ghost" :disabled="actionBusy || !wallet.isConnected.value" @click="handleDisconnect">
        Disconnect
      </button>
    </div>

    <p v-if="wallet.error.value" class="wallet-card__error">
      {{ wallet.error.value }}
    </p>

    <div class="wallet-card__headers">
      <p class="eyebrow">
        Active request headers
      </p>
      <div class="wallet-card__header-list">
        <div v-for="[key, value] in headerEntries" :key="key" class="wallet-card__header-row">
          <span>{{ key }}</span>
          <strong>{{ truncateMiddle(String(value), 34) }}</strong>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wallet-card {
  padding: 22px;
  display: grid;
  gap: 18px;
}

.wallet-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.wallet-card__header h2 {
  margin: 12px 0 0;
  font-size: 1.22rem;
}

.wallet-card__state {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(146, 198, 229, 0.12);
  background: rgba(12, 28, 43, 0.78);
  color: var(--text-1);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 10px;
}

.wallet-card__state--ready {
  border-color: rgba(73, 211, 154, 0.22);
  background: rgba(18, 54, 43, 0.72);
  color: #c7f6e2;
}

.wallet-card__meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.wallet-card__metric {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(146, 198, 229, 0.1);
  background: rgba(8, 20, 33, 0.62);
}

.wallet-card__metric span {
  color: var(--text-2);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.wallet-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.action-button {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid transparent;
  transition: transform 160ms ease, opacity 160ms ease, border-color 160ms ease;
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-button--primary {
  background: linear-gradient(135deg, #5bd6ff, #2eaad7);
  color: #03111b;
}

.action-button--secondary {
  background: rgba(12, 36, 56, 0.82);
  border-color: rgba(91, 214, 255, 0.18);
}

.action-button--ghost {
  background: transparent;
  border-color: rgba(146, 198, 229, 0.16);
}

.wallet-card__error {
  margin: 0;
  color: #ffc3cb;
}

.wallet-card__headers {
  display: grid;
  gap: 12px;
}

.wallet-card__header-list {
  display: grid;
  gap: 10px;
}

.wallet-card__header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(146, 198, 229, 0.1);
  background: rgba(8, 20, 33, 0.62);
}

.wallet-card__header-row span {
  color: var(--text-2);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.wallet-card__header-row strong {
  text-align: right;
}

@media (max-width: 760px) {
  .wallet-card__meta-grid {
    grid-template-columns: 1fr;
  }

  .wallet-card__header-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .wallet-card__header-row strong {
    text-align: left;
  }
}
</style>
