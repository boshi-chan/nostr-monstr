<script lang="ts">
  import { debugLogStore } from '$stores/debug'

  export let enabled = false

</script>

{#if enabled}
  <div class="debug-overlay">
    <div class="debug-header">
      <span>Debug Logs</span>
      <button on:click={() => debugLogStore.clear()} class="clear-btn">Clear</button>
    </div>
    <div class="debug-body">
      {#each $debugLogStore as log}
        <div class={`log-entry ${log.level}`}>
          <div class="log-meta">
            <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
            <span class="level">{log.level}</span>
          </div>
          <pre>{log.message}</pre>
          {#if log.details?.length}
            <pre class="details">{JSON.stringify(log.details, null, 2)}</pre>
          {/if}
        </div>
      {:else}
        <p class="empty">No logs captured.</p>
      {/each}
    </div>
  </div>
{/if}

<style>
  .debug-overlay {
    position: fixed;
    top: env(safe-area-inset-top, 0px);
    left: 0;
    right: 0;
    max-height: 40vh;
    z-index: 9999;
    background: rgba(7, 11, 17, 0.95);
    color: #fff;
    font-family: monospace;
    font-size: 11px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }

  .debug-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font-weight: bold;
  }

  .clear-btn {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
  }

  .debug-body {
    max-height: calc(40vh - 32px);
    overflow-y: auto;
    padding: 8px 12px;
  }

.log-entry {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.log-entry.info {
  color: #b3e5fc;
}

.log-entry.warn {
  color: #ffd479;
}

.log-entry.error {
    color: #ff7a7a;
  }

  .log-meta {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: 10px;
  }

  .level {
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .empty {
    text-align: center;
    padding: 20px 0;
    color: rgba(255, 255, 255, 0.5);
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .details {
    margin-top: 4px;
    color: rgba(255, 255, 255, 0.7);
  }
</style>
