<script setup lang="ts">
import { useWalletSession } from '@/modules/wallet/session'

const props = withDefaults(defineProps<{
  compact?: boolean
}>(), {
  compact: false,
})

const wallet = useWalletSession()

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
  <div class="wallet-connect">
    <span v-if="wallet.error.value" class="wallet-connect__error">{{ wallet.error.value }}</span>

    <button
      v-if="!wallet.isConnected.value"
      class="wallet-connect__button wallet-connect__button--base"
      :disabled="wallet.connecting.value"
      type="button"
      @click="handleConnect"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
        <path d="M16 12h2" />
      </svg>
      <span>{{ wallet.connecting.value ? 'Connecting…' : (props.compact ? 'Connect' : 'Connect Solana') }}</span>
    </button>

    <a
      v-if="!wallet.isConnected.value && wallet.mobileWalletFallbackAvailable.value"
      class="wallet-connect__button wallet-connect__button--fallback"
      :href="wallet.mobileWalletFallbackHref.value"
    >
      <span>Open in Phantom</span>
    </a>

    <template v-else>
      <button
        v-if="!wallet.isAuthenticated.value"
        class="wallet-connect__button wallet-connect__button--auth"
        :disabled="wallet.authenticating.value"
        type="button"
        @click="handleAuthenticate"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l7 3.5V12c0 4.1-2.6 7.8-7 9-4.4-1.2-7-4.9-7-9V6.5z" />
          <path d="M12 10v4" />
          <path d="M12 17h.01" />
        </svg>
        <span>{{ wallet.authenticating.value ? 'Signing…' : (props.compact ? 'Sign' : 'Sign Wallet Session') }}</span>
      </button>

      <button
        v-else
        class="wallet-connect__button wallet-connect__button--ready"
        type="button"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 12 4 4L19 6" />
        </svg>
        <span>{{ wallet.shortAddress.value }}</span>
      </button>

      <button
        class="wallet-connect__button wallet-connect__button--icon"
        type="button"
        title="Disconnect wallet"
        aria-label="Disconnect wallet"
        @click="handleDisconnect"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6H5v12h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      </button>
    </template>
  </div>
</template>

<style scoped>
.wallet-connect {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.wallet-connect__error {
  color: #ff9ca8;
  font-size: 0.72rem;
}

.wallet-connect__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 40px;
  border-radius: 16px;
  border: 1px solid rgba(138, 218, 255, 0.14);
  padding: 0 14px;
  font-size: 0.84rem;
  font-weight: 600;
  backdrop-filter: blur(16px);
  transition: transform 160ms ease, opacity 160ms ease, background-color 160ms ease;
}

.wallet-connect__button:hover {
  transform: translateY(-1px);
}

.wallet-connect__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.wallet-connect__button--base {
  background: rgba(248, 251, 255, 0.72);
  color: #09131d;
}

.wallet-connect__button--auth {
  background: rgba(255, 193, 94, 0.22);
  border-color: rgba(255, 193, 94, 0.34);
  color: #ffe3ac;
}

.wallet-connect__button--fallback {
  background: rgba(8, 23, 35, 0.72);
  color: rgba(223, 236, 247, 0.92);
}

.wallet-connect__button--ready {
  background: rgba(57, 173, 124, 0.18);
  border-color: rgba(73, 211, 154, 0.28);
  color: #dcf9eb;
}

.wallet-connect__button--icon {
  width: 40px;
  padding: 0;
  background: rgba(8, 23, 35, 0.74);
  color: var(--text-1);
}

.wallet-connect__button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 720px) {
  .wallet-connect__error {
    display: none;
  }
}
</style>
