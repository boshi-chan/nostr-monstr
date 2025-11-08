<script lang="ts">
  import { showNewGroupModal, activeConversation } from '$stores/messages'
  import { metadataCache } from '$stores/feed'
  import { createGroupChat } from '$lib/messaging'
  import Modal from '../Modal.svelte'
  import { onMount } from 'svelte'

  let groupName = ''
  let selectedMembers: string[] = []
  let memberSearch = ''
  let isCreating = false
  let error = ''
  let inputElement: HTMLInputElement

  onMount(() => {
    if ($showNewGroupModal) {
      setTimeout(() => inputElement?.focus(), 100)
    }
  })

  $: availableMembers = Array.from($metadataCache.entries())
    .filter(([pubkey]) => !selectedMembers.includes(pubkey))
    .filter(
      ([_, metadata]) =>
        !memberSearch.trim() ||
        metadata.name?.toLowerCase().includes(memberSearch.toLowerCase())
    )
    .slice(0, 10)

  async function handleCreateGroup() {
    error = ''

    if (!groupName.trim()) {
      error = 'Group name is required'
      return
    }

    if (selectedMembers.length === 0) {
      error = 'Add at least one member'
      return
    }

    try {
      isCreating = true
      const groupId = await createGroupChat(groupName, selectedMembers)
      activeConversation.set(groupId)
      showNewGroupModal.set(false)
      resetForm()
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create group'
    } finally {
      isCreating = false
    }
  }

  function addMember(pubkey: string) {
    selectedMembers = [...selectedMembers, pubkey]
    memberSearch = ''
  }

  function removeMember(pubkey: string) {
    selectedMembers = selectedMembers.filter(p => p !== pubkey)
  }

  function resetForm() {
    groupName = ''
    selectedMembers = []
    memberSearch = ''
    error = ''
  }

  function handleClose() {
    showNewGroupModal.set(false)
    resetForm()
  }
</script>

<Modal isOpen={$showNewGroupModal} onClose={handleClose} title="Create Group Chat">
  <div class="space-y-4">
    <!-- Group name input -->
    <div>
      <label for="group-name" class="block text-sm font-medium text-text-soft mb-2">Group Name</label>
      <input
        id="group-name"
        bind:this={inputElement}
        bind:value={groupName}
        type="text"
        placeholder="e.g., Bitcoin Enthusiasts"
        class="w-full rounded-xl border border-dark-border/40 bg-dark/60 px-4 py-2.5 text-sm text-text-soft placeholder-text-muted/60 transition-colors duration-200 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
        disabled={isCreating}
      />
    </div>

    <!-- Selected members -->
    {#if selectedMembers.length > 0}
      <div>
        <p class="text-sm font-medium text-text-soft mb-2">Members ({selectedMembers.length})</p>
        <div class="flex flex-wrap gap-2">
          {#each selectedMembers as pubkey (pubkey)}
            {@const metadata = $metadataCache.get(pubkey)}
            <div class="flex items-center gap-2 rounded-lg bg-primary/20 px-3 py-1.5">
              <span class="text-sm text-text-soft">
                {metadata?.name || pubkey.slice(0, 8)}
              </span>
              <button
                type="button"
                class="text-text-muted/60 hover:text-text-soft transition-colors"
                on:click={() => removeMember(pubkey)}
                title="Remove member"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Add members -->
    <div>
      <label for="member-search" class="block text-sm font-medium text-text-soft mb-2">Add Members</label>
      <input
        id="member-search"
        type="text"
        placeholder="Search contacts..."
        bind:value={memberSearch}
        class="w-full rounded-xl border border-dark-border/40 bg-dark/60 px-4 py-2.5 text-sm text-text-soft placeholder-text-muted/60 transition-colors duration-200 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
        disabled={isCreating}
      />

      {#if memberSearch.trim() && availableMembers.length > 0}
        <div class="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-dark-border/30 bg-dark/40 p-2">
          {#each availableMembers as [pubkey, metadata] (pubkey)}
            <button
              type="button"
              class="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-dark/60"
              on:click={() => addMember(pubkey)}
              disabled={isCreating}
            >
              <div class="flex items-center gap-2">
                {#if metadata.picture}
                  <img
                    src={metadata.picture}
                    alt={metadata.name}
                    class="h-6 w-6 rounded-full object-cover"
                  />
                {:else}
                  <div class="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    {(metadata.name || 'U').slice(0, 1).toUpperCase()}
                  </div>
                {/if}
                <span class="text-text-soft">{metadata.name || pubkey.slice(0, 8)}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Error message -->
    {#if error}
      <div class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
        {error}
      </div>
    {/if}

    <!-- Create button -->
    <button
      type="button"
      class="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-dark transition-all duration-200 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      on:click={handleCreateGroup}
      disabled={isCreating || !groupName.trim() || selectedMembers.length === 0}
    >
      {isCreating ? 'Creating...' : 'Create Group'}
    </button>
  </div>
</Modal>
