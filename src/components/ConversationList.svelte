<script lang="ts">
  import { conversationMetadata, activeConversation, unreadCounts } from '$stores/messages'
  import { metadataCache } from '$stores/feed'
  import type { Conversation } from '$types/dm'
  import { loadConversation } from '$lib/messaging'
  import SearchIcon from 'lucide-svelte/icons/search'


  import { onMount } from 'svelte'
import { loadConversations } from '$lib/messaging'

onMount(() => {
  loadConversations()
})


  let searchQuery = ''
  let filteredConversations: Conversation[] = []

  $: {
    // Use conversationMetadata for display info
    const convArray = Array.from($conversationMetadata.values())
    if (!searchQuery.trim()) {
      filteredConversations = convArray.sort((a, b) => b.lastUpdated - a.lastUpdated)
    } else {
      const query = searchQuery.toLowerCase()
      filteredConversations = convArray
        .filter(
          conv =>
            (conv.participantName?.toLowerCase().includes(query) ?? false) ||
            (conv.participantPubkey?.toLowerCase().includes(query) ?? false) ||
            (conv.lastMessagePreview?.toLowerCase().includes(query) ?? false)
        )
        .sort((a, b) => b.lastUpdated - a.lastUpdated)
    }
  }

  async function handleSelectConversation(conv: Conversation) {
    activeConversation.set(conv.id)
    // Load messages for this conversation
    if (conv.participantPubkey) {
      await loadConversation(conv.participantPubkey)
    }
    // Clear unread count
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
    return 'Unknown'
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
    const name = getDisplayName(conv)
    return name.charAt(0).toUpperCase()
  }

  function truncatePreview(text: string | undefined, maxLength: number = 50): string {
    if (!text) return 'No messages yet'
    if (text.length > maxLength) {
      return text.slice(0, maxLength) + '...'
    }
    return text
  }

  function formatTime(timestamp: number): string {
    // Nostr timestamps are in seconds, convert to milliseconds
    const timestampMs = timestamp * 1000
    const now = Date.now()
    const diff = now - timestampMs
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }
</script>

<!-- Left panel: Conversation list -->
<div class="flex h-full flex-col bg-dark-light/40 md:border-r md:border-dark-border/50">
  <!-- Search header -->
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

  <!-- Conversations list -->
  <div class="flex-1 overflow-y-auto">
    {#if filteredConversations.length === 0}
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
        {#each filteredConversations as conversation (conversation.id)}
          <button
            on:click={() => handleSelectConversation(conversation)}
            class={`w-full px-4 py-3 text-left transition-all duration-200 hover:bg-dark-light/60 ${
              $activeConversation === conversation.id ? 'bg-primary/15' : ''
            }`}
          >
            <div class="flex items-start gap-3">
              <!-- Avatar -->
              <div class="relative mt-0.5 flex-shrink-0">
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

                <!-- Unread indicator -->
                {#if ($unreadCounts.get(conversation.id) ?? 0) > 0}
                  <div class="absolute right-0 top-0 h-3 w-3 rounded-full bg-primary shadow-md" />
                {/if}
              </div>

              <!-- Content -->
              <div class="min-w-0 flex-1">
                <!-- Name and timestamp -->
                <div class="flex items-baseline justify-between gap-2">
                  <h3 class="truncate text-sm font-semibold text-text-soft">
                    {getDisplayName(conversation)}
                  </h3>
                  <span class="flex-shrink-0 text-xs text-text-muted">
                    {formatTime(conversation.lastUpdated)}
                  </span>
                </div>

                <!-- Username -->
                <p class="truncate text-xs text-text-muted">
                  {getDisplayUsername(conversation)}
                </p>

                <!-- Message preview -->
                <p class="mt-1 truncate text-xs text-text-muted">
                  {truncatePreview(conversation.lastMessagePreview || 'Encrypted message')}
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
  /* Scrollbar styling */
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
