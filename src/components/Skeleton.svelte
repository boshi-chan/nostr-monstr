<script lang="ts">
  export let count = 3
  export let height = 'h-16'
</script>

<div class="space-y-2">
  {#each Array(count) as _, i (i)}
    <div class="animate-pulse">
      <div class="{height} bg-dark-light rounded-lg" />
    </div>
  {/each}
</div>

<style>
  :global(.animate-pulse) {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
</style>
