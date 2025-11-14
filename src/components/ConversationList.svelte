<script lang="ts">
  import { onMount } from 'svelte'
  import { conversations, conversationMetadata, activeConversation, unreadCounts, messagesLoading } from '$stores/messages'
  import { metadataCache } from '$stores/feed'
  import type { Conversation } from '$types/dm'
  import { loadConversation, loadConversations } from '$lib/messaging-simple'
  import { openProfile } from '$stores/router'
  import SearchIcon from 'lucide-svelte/icons/search'

  onMount(() => {
    loadConversations().catch(err => logger.error('DM bootstrap failed:', err))
  })

  let searchQuery = ''
  let filtered: Conversation[] = []
  let hasLoadedOnce = false

  // Track if we've loaded at least once to avoid showing "no conversations" during initial load
  $: if ($conversationMetadata.size > 0) {
    hasLoadedOnce = true
  }

  $: {
    const list = Array.from($conversationMetadata.values())
    const query = searchQuery.trim().toLowerCase()
    filtered = list
      .filter(conv => {
        if (!query) return true
        return (
          conv.participantName?.toLowerCase().includes(query) ||
          conv.participantPubkey?.toLowerCase().includes(query) ||
          conv.lastMessagePreview?.toLowerCase().includes(query)
        )
      })
      .sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0))
  }

  async function handleSelectConversation(conv: Conversation) {
    activeConversation.set(conv.id)
    if (conv.participantPubkey) {
      await loadConversation(conv.participantPubkey)
    }
    unreadCounts.update(counts => {
      const next = new Map(counts)
      next.set(conv.id, 0)
      return next
    })
  }

  function getDisplayName(conv: Conversation): string {
    if (conv.participantName) return conv.participantName
    if (conv.participantPubkey) {
      const metadata = $metadataCache.get(conv.participantPubkey)
      if (metadata?.name) return metadata.name
      return conv.participantPubkey.slice(0, 12) + '...'
    }
    return 'Conversation'
  }

  function getDisplayUsername(conv: Conversation): string {
    if (conv.participantPubkey) {
      const metadata = $metadataCache.get(conv.participantPubkey)
      if (metadata?.nip05) return '@' + metadata.nip05.split('@')[0]
      return '@' + conv.participantPubkey.slice(0, 8)
    }
    return ''
  }

  function getAvatarUrl(conv: Conversation): string | null {
    if (!conv.participantPubkey) return null
    const metadata = $metadataCache.get(conv.participantPubkey)
    if (!metadata?.picture) return null
    if (metadata.picture.startsWith('ipfs://')) {
      return `https://ipfs.io/ipfs/${metadata.picture.slice(7)}`
    }
    if (metadata.picture.startsWith('http')) {
      return metadata.picture
    }
    return null
  }

  function getAvatarInitial(conv: Conversation): string {
    return getDisplayName(conv).charAt(0).toUpperCase()
  }

  function preview(conv: Conversation): string {
    const list = $conversations.get(conv.id)
    if (!list?.length) return 'No messages yet'
    const last = list[list.length - 1]
    const base = last.content || (last.failed ? '[Failed to decrypt]' : '')
    if (!base) return 'No messages yet'
    return base.length > 80 ? `${base.slice(0, 80)}…` : base
  }

  function formatTime(timestamp: number): string {
    if (!timestamp) return ''
    const ms = timestamp * 1000
    const diff = Date.now() - ms
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  function handleProfileClick(event: MouseEvent, pubkey: string) {
    event.stopPropagation()
    openProfile(pubkey, 'messages')
  }
</script>

<div class="flex h-full flex-col bg-dark-light/40 md:border-r md:border-dark-border/50">
  <div class="flex-shrink-0 border-b border-dark-border/30 p-4">
    <div class="relative">
      <SearchIcon class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <input
        type="text"
        placeholder="Search conversations..."
        bind:value={searchQuery}
        class="w-full rounded-full bg-dark-light/50 pl-10 pr-4 py-2.5 text-sm text-text-soft placeholder-text-muted outline-none transition-colors focus:bg-dark-light/70"
      />
    </div>
  </div>

  <div class="flex-1 overflow-y-auto">
    {#if $messagesLoading && !hasLoadedOnce}
      <!-- Show loading state only on first load -->
      <div class="flex h-full items-center justify-center p-4 text-center">
        <div>
          <div class="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p class="text-sm text-text-soft">Finding messages...</p>
          <p class="mt-1 text-xs text-text-muted">This may take a few moments</p>
        </div>
      </div>
    {:else if filtered.length === 0}
      <div class="flex h-full items-center justify-center p-4 text-center">
        <div>
          <p class="text-sm text-text-muted">
            {searchQuery ? 'No conversations found' : 'No conversations yet'}
          </p>
          <p class="mt-1 text-xs text-text-muted">
            {searchQuery ? 'Try a different search' : 'Direct messages will appear here'}
          </p>
        </div>
      </div>
    {:else}
      <div class="divide-y divide-dark-border/20">
        {#each filtered as conversation (conversation.id)}
          <button
            on:click={() => handleSelectConversation(conversation)}
            class={`w-full px-4 py-3 text-left transition-all duration-200 hover:bg-dark-light/60 ${
              $activeConversation === conversation.id ? 'bg-primary/15' : ''
            }`}
          >
            <div class="flex items-start gap-3">
              <button
                type="button"
                on:click={(e) => conversation.participantPubkey && handleProfileClick(e, conversation.participantPubkey)}
                class="relative mt-0.5 flex-shrink-0 cursor-pointer transition-opacity hover:opacity-80"
              >
                {#if getAvatarUrl(conversation)}
                  <img
                    src={getAvatarUrl(conversation)}
                    alt={getDisplayName(conversation)}
                    class="h-12 w-12 rounded-full object-cover"
                  />
                {:else}
                  <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
                    {getAvatarInitial(conversation)}
                  </div>
                {/if}

                {#if ($unreadCounts.get(conversation.id) ?? 0) > 0}
                  <div class="absolute right-0 top-0 h-3 w-3 rounded-full bg-primary shadow-md" />
                {/if}
              </button>

              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-2">
                  <button
                    type="button"
                    on:click={(e) => conversation.participantPubkey && handleProfileClick(e, conversation.participantPubkey)}
                    class="truncate text-sm font-semibold text-text-soft cursor-pointer hover:text-white transition-colors"
                  >
                    {getDisplayName(conversation)}
                  </button>
                  <span class="flex-shrink-0 text-xs text-text-muted">
                    {formatTime(conversation.lastUpdated ?? 0)}
                  </span>
                </div>

                <p class="truncate text-xs text-text-muted">
                  {getDisplayUsername(conversation)}
                </p>

                <p class="mt-1 truncate text-xs text-text-muted">
                  {preview(conversation)}
                </p>
              </div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  :global(.conversation-list::-webkit-scrollbar) {
    width: 6px;
  }

  :global(.conversation-list::-webkit-scrollbar-track) {
    background: transparent;
  }

  :global(.conversation-list::-webkit-scrollbar-thumb) {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  :global(.conversation-list::-webkit-scrollbar-thumb:hover) {
    background: rgba(255, 255, 255, 0.2);
  }
</style>

