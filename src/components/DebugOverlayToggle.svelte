<script lang="ts">
  import { debugOverlayEnabled } from '$stores/debugOverlay'
  import { get } from 'svelte/store'

  let tapCount = 0
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  function handleToggle() {
    debugOverlayEnabled.toggle()
  }

  function handleTapZoneClick() {
    tapCount += 1
    if (tapCount >= 5) {
      tapCount = 0
      debugOverlayEnabled.toggle()
    }
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      tapCount = 0
    }, 2000)
  }
</script>

<div class="debug-toggle" on:click={handleToggle}>
  <div class="tap-zone" on:click|stopPropagation={handleTapZoneClick}></div>
</div>

<style>
  .debug-toggle {
    position: fixed;
    top: env(safe-area-inset-top, 0px);
    right: 0;
    z-index: 9998;
  }

  .tap-zone {
    position: absolute;
    top: 0;
    right: 0;
    width: 64px;
    height: 24px;
    opacity: 0;
  }
</style>
