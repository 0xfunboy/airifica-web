<template>
  <aside class="interactive-area">
    <div class="interactive-area__inner">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.interactive-area {
  display: flex;
  flex-direction: column;
  width: min(500px, 32vw);
  min-width: 30%;
  height: var(--stage-side-panel-height, 85dvh);
}

.interactive-area__inner {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding-block: 16px;
}

@media (max-width: 980px) {
  .interactive-area {
    position: relative;
    width: 100%;
    min-width: 0;
    height: auto;
  }

  .interactive-area__inner {
    padding-block: 0;
  }
}
</style>
