<script lang="ts">
  import type { DirectMessage } from '$types/dm'
  import { metadataCache } from '$stores/feed'
  import { formatDate } from '$lib/utils'

  export let message: DirectMessage
  export let isOwn = false
  export let showAvatar = true

  $: metadata = $metadataCache.get(message.senderPubkey)
  $: displayName = metadata?.name || message.senderPubkey.slice(0, 8)
</script>

<div class={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
  {#if showAvatar}
    <div class="flex-shrink-0">
      {#if metadata?.picture}
        <img
          src={metadata.picture}
          alt={displayName}
          class="h-8 w-8 rounded-full object-cover"
        />
      {:else}
        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
      {/if}
    </div>
  {:else}
    <div class="w-8 flex-shrink-0" />
  {/if}

  <div class={`flex flex-col gap-1 max-w-xs ${isOwn ? 'items-end' : 'items-start'}`}>
    {#if showAvatar && !isOwn}
      <p class="text-xs font-semibold text-text-muted">{displayName}</p>
    {/if}

    <div
      class={`rounded-2xl px-4 py-2 text-sm break-words ${
        isOwn
          ? 'rounded-br-none bg-primary/20 text-text-soft'
          : 'rounded-bl-none border border-dark-border/40 bg-dark/60 text-text-soft'
      }`}
    >
      {message.content}
    </div>

    <div class="flex items-center gap-2 text-xs text-text-muted/60">
      <span>{formatDate(message.createdAt)}</span>
    </div>
  </div>
</div>
