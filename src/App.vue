<script setup lang="ts">
const highlights = [
  'Root-first workspace without nested app folders.',
  'Dedicated packages only for AIR3 client and avatar runtime.',
  'No Live2D, no bundled brand media, no heavyweight font payloads.',
]
</script>

<template>
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">Airifica Web</p>
      <h1>Fresh workspace for the AIR3 web interface.</h1>
      <p class="intro">
        The repository now starts from a minimal root application. Functional modules will be rebuilt as focused packages instead of carrying over monorepo sprawl.
      </p>
      <ul class="list">
        <li v-for="item in highlights" :key="item">
          {{ item }}
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
}

.hero {
  width: min(100%, 56rem);
  padding: clamp(1.5rem, 4vw, 3rem);
  border-radius: 2rem;
  background: linear-gradient(160deg, rgba(17, 24, 39, 0.9), rgba(15, 23, 42, 0.7));
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 32px 80px rgba(15, 23, 42, 0.35);
}

.eyebrow {
  margin: 0 0 1rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  font-size: 0.75rem;
  color: #94a3b8;
}

h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 4rem);
  line-height: 1;
}

.intro {
  margin: 1.25rem 0 0;
  max-width: 48rem;
  color: #cbd5e1;
  line-height: 1.6;
}

.list {
  margin: 1.5rem 0 0;
  padding-left: 1.25rem;
  color: #e2e8f0;
  line-height: 1.7;
}
</style>

