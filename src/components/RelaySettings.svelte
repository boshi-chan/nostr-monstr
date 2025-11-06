<script lang="ts">
  import { currentUser } from '$stores/auth'
  import { getRelaysFromNIP65, publishRelays, getDefaultRelays, isValidRelayUrl, type RelayConfig } from '$lib/relays'
  import { onMount } from 'svelte'

  let relays: RelayConfig[] = []
  let newRelayUrl = ''
  let loading = false
  let error: string | null = null
  let success: string | null = null
  let showForm = false

  onMount(async () => {
    await loadRelays()
  })

  async function loadRelays() {
    try {
      loading = true
      error = null
      const fetchedRelays = await getRelaysFromNIP65()
      relays = fetchedRelays.length > 0 ? fetchedRelays : getDefaultRelays()
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  }

  async function handleAddRelay() {
    if (!newRelayUrl.trim()) {
      error = 'Relay URL cannot be empty'
      return
    }

    if (!isValidRelayUrl(newRelayUrl)) {
      error = 'Invalid relay URL. Must be wss:// format'
      return
    }

    if (relays.some(r => r.url === newRelayUrl)) {
      error = 'This relay is already added'
      return
    }

    try {
      loading = true
      error = null
      success = null

      const updatedRelays = [...relays, { url: newRelayUrl, read: true, write: true }]
      await publishRelays(updatedRelays)

      relays = updatedRelays
      newRelayUrl = ''
      showForm = false
      success = 'Relay added successfully'
      setTimeout(() => (success = null), 3000)
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  }

  async function handleRemoveRelay(url: string) {
    try {
      loading = true
      error = null
      success = null

      const updatedRelays = relays.filter(r => r.url !== url)

      if (updatedRelays.length === 0) {
        error = 'Cannot remove all relays - you must keep at least one'
        return
      }

      await publishRelays(updatedRelays)

      relays = updatedRelays
      success = 'Relay removed successfully'
      setTimeout(() => (success = null), 3000)
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  }

  async function handleToggleRelay(index: number, type: 'read' | 'write') {
    try {
      loading = true
      error = null
      success = null

      const relay = relays[index]
      const updated = { ...relay }

      if (type === 'read') {
        updated.read = !updated.read
      } else {
        updated.write = !updated.write
      }

      // Ensure at least one is enabled
      if (!updated.read && !updated.write) {
        error = 'Relay must have read or write enabled'
        return
      }

      const updatedRelays = [...relays]
      updatedRelays[index] = updated

      await publishRelays(updatedRelays)

      relays = updatedRelays
      success = 'Relay updated successfully'
      setTimeout(() => (success = null), 3000)
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  }
</script>

<section class="space-y-4">
  <div class="flex items-center justify-between">
    <h4 class="text-sm font-semibold uppercase tracking-[0.3em] text-text-muted">Relays</h4>
    <button
      type="button"
      on:click={() => (showForm = !showForm)}
      class="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
      disabled={loading}
    >
      {showForm ? 'Cancel' : 'Add Relay'}
    </button>
  </div>

  {#if showForm}
    <div class="surface-card space-y-3 p-4">
      <input
        type="text"
        placeholder="wss://relay.example.com"
        bind:value={newRelayUrl}
        class="w-full rounded-lg border border-dark-border bg-dark/50 px-3 py-2 text-sm text-text-soft placeholder-text-muted/50 outline-none focus:border-primary/60"
        disabled={loading}
      />
      <button
        type="button"
        on:click={handleAddRelay}
        disabled={loading || !newRelayUrl.trim()}
        class="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-dark transition-colors disabled:opacity-50 hover:bg-primary/90"
      >
        {loading ? 'Adding...' : 'Add Relay'}
      </button>
    </div>
  {/if}

  {#if error}
    <div class="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
      {error}
    </div>
  {/if}

  {#if success}
    <div class="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-300">
      {success}
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-4">
      <p class="text-sm text-text-muted">Loading...</p>
    </div>
  {:else if relays.length === 0}
    <div class="rounded-lg border border-dark-border/60 bg-dark/50 p-4 text-center text-sm text-text-muted">
      No relays configured. Add one to get started.
    </div>
  {:else}
    <div class="space-y-2">
      {#each relays as relay, index (relay.url)}
        <div class="surface-card flex items-center justify-between gap-4 p-4">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-text-soft">{relay.url}</p>
            <div class="mt-2 flex gap-4">
              <label class="flex items-center gap-2 text-xs text-text-muted">
                <input
                  type="checkbox"
                  checked={relay.read}
                  on:change={() => handleToggleRelay(index, 'read')}
                  disabled={loading || (!relay.read && !relay.write)}
                  class="rounded"
                />
                <span>Read</span>
              </label>
              <label class="flex items-center gap-2 text-xs text-text-muted">
                <input
                  type="checkbox"
                  checked={relay.write}
                  on:change={() => handleToggleRelay(index, 'write')}
                  disabled={loading || (!relay.read && !relay.write)}
                  class="rounded"
                />
                <span>Write</span>
              </label>
            </div>
          </div>
          <button
            type="button"
            on:click={() => handleRemoveRelay(relay.url)}
            disabled={loading || relays.length === 1}
            class="text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
            title="Remove relay"
          >
            ✕
          </button>
        </div>
      {/each}
    </div>
  {/if}
</section>
