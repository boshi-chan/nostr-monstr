<script lang="ts">
  import { conversationMessages, activeConversationData } from '$stores/messages'
  import { metadataCache } from '$stores/feed'
  import type { DirectMessage } from '$types/dm'
  import { getCurrentNDKUser } from '$lib/ndk'
  import { getDisplayName, getAvatarUrl } from '$lib/metadata'
  import InfoIcon from 'lucide-svelte/icons/info'
  import MessageCircleMore from 'lucide-svelte/icons/message-circle-more'

  let messagesContainer: HTMLDivElement
  let currentUser = getCurrentNDKUser()
  let messages: DirectMessage[] = []   // <= THIS WAS THE MISSING LINE

  // force Svelte to redraw arr
  $: messages = [...$conversationMessages]

  $: {
    if (messagesContainer && $conversationMessages.length > 0) {
      setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight
      }, 100)
    }
  }

  function groupMessages(messages: DirectMessage[]) {
    if (!messages.length) return []
    const grouped = []
    let currentGroup = null
    for (const msg of messages) {
      if (!currentGroup || currentGroup.sender !== msg.senderPubkey) {
        if (currentGroup) grouped.push(currentGroup)
        currentGroup = { sender: msg.senderPubkey, messages: [msg] }
      } else {
        currentGroup.messages.push(msg)
      }
    }
    if (currentGroup) grouped.push(currentGroup)
    return grouped
  }

  function formatMessageTime(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' })
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function formatGroupTime(t: number) { return formatMessageTime(t) }

  function shouldShowTimestamp(messages: DirectMessage[], index: number) {
    if (index === 0) return true
    return messages[index].createdAt - messages[index - 1].createdAt > 300
  }

  function getSenderName(pk: string) {
    const m = $metadataCache.get(pk)
    return getDisplayName(pk, m) || pk.slice(0, 12) + '...'
  }

  function getSenderAvatar(pk: string) {
    const m = $metadataCache.get(pk)
    return getAvatarUrl(m)
  }

  function getSenderInitial(pk: string) { return getSenderName(pk).charAt(0).toUpperCase() }

  function isOwnMessage(senderPubkey: string) {
    return senderPubkey === currentUser?.pubkey
  }
</script>

<div class="flex h-full flex-col overflow-hidden bg-dark">
  {#if $activeConversationData}
    <div class="flex-shrink-0 border-b border-dark-border/30 bg-dark-light/40 px-4 py-3 md:px-6 md:py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          {#if $activeConversationData.participantPubkey}
            {#if getSenderAvatar($activeConversationData.participantPubkey)}
              <img src={getSenderAvatar($activeConversationData.participantPubkey)} class="h-10 w-10 rounded-full object-cover" />
            {:else}
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">{getSenderInitial($activeConversationData.participantPubkey)}</div>
            {/if}

            <div class="min-w-0">
              <h2 class="text-sm font-semibold text-text-soft truncate">{getSenderName($activeConversationData.participantPubkey)}</h2>
              <p class="text-xs text-text-muted truncate">@{$activeConversationData.participantPubkey.slice(0, 8)}</p>
            </div>
          {/if}
        </div>
        <button class="flex-shrink-0 rounded-full p-2 text-text-muted transition-colors hover:bg-dark-light/60 hover:text-text-soft"><InfoIcon class="h-5 w-5" /></button>
      </div>
    </div>

    <div bind:this={messagesContainer} class="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 md:px-6 md:py-6">
      {#if $conversationMessages.length === 0}
        <div class="flex h-full items-center justify-center">
          <div class="text-center">
            <MessageCircleMore class="mx-auto mb-3 h-12 w-12 text-text-muted/40" />
            <p class="text-sm text-text-muted">No messages yet</p>
            <p class="mt-1 text-xs text-text-muted">Start a conversation by sending a message</p>
          </div>
        </div>
      {:else}
        <div class="space-y-4">
          {#each groupMessages($conversationMessages) as group (group.messages[0].id)}
            {#if shouldShowTimestamp(group.messages, 0)}
              <div class="flex items-center justify-center py-2">
                <div class="rounded-full bg-dark-light/40 px-3 py-1 text-xs text-text-muted">{formatGroupTime(group.messages[0].createdAt)}</div>
              </div>
            {/if}

            <div class={`flex gap-2 ${isOwnMessage(group.sender) ? 'flex-row-reverse' : ''}`}>
              <div class="mt-auto flex-shrink-0">
                {#if getSenderAvatar(group.sender)}
                  <img src={getSenderAvatar(group.sender)} class="h-8 w-8 rounded-full object-cover" />
                {:else}
                  <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">{getSenderInitial(group.sender)}</div>
                {/if}
              </div>

              <div class={`flex w-full max-w-[65%] flex-col gap-1 ${isOwnMessage(group.sender) ? 'items-end' : 'items-start'}`}>
                {#each group.messages as message (message.id)}
                  {#if !isOwnMessage(group.sender) && group.messages.indexOf(message) === 0}
                    <p class="px-3 text-xs text-text-muted">{getSenderName(group.sender)}</p>
                  {/if}

                  <div class={`rounded-3xl px-4 py-2 text-sm leading-relaxed break-words overflow-wrap-anywhere ${isOwnMessage(group.sender) ? 'bg-primary text-white' : 'bg-dark-light/60 text-text-soft'} ${message.failed ? 'opacity-50' : ''}`}>
                    {#if message.failed}
                      <span class="italic text-red-400">{message.content || '[Failed to decrypt]'}</span>
                    {:else}
                      <span class="whitespace-pre-wrap break-words flex-1">{message.content || '[decrypting…]'}</span>
                    {/if}
                  </div>

                  {#if shouldShowTimestamp(group.messages, group.messages.indexOf(message))}
                    <span class="px-3 text-xs text-text-muted/60">{formatMessageTime(message.createdAt)}</span>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <div class="flex h-full items-center justify-center text-center">
      <div>
        <MessageCircleMore class="mx-auto mb-3 h-16 w-16 text-text-muted/30" />
        <h2 class="text-lg font-semibold text-text-soft">No conversation selected</h2>
        <p class="mt-2 text-sm text-text-muted">Select a conversation from the list to start messaging</p>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(div::-webkit-scrollbar) { width: 6px; }
  :global(div::-webkit-scrollbar-track) { background: transparent; }
  :global(div::-webkit-scrollbar-thumb) { background: rgba(255, 255, 255, 0.1); border-radius: 3px; }
  :global(div::-webkit-scrollbar-thumb:hover) { background: rgba(255, 255, 255, 0.2); }
  :global(.break-words) { word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; hyphens: auto; }
</style>
