<script lang="ts">
  import { feedFilters, toggleReplies, toggleReposts, toggleMedia, toggleBots, toggleLongReads } from '$stores/feedFilters'
  import CommentIcon from './icons/CommentIcon.svelte'
  import RepostIcon from './icons/RepostIcon.svelte'
  import ImageIcon from './icons/ImageIcon.svelte'
  import BotIcon from './icons/BotIcon.svelte'
  import BookOpenIcon from './icons/BookOpenIcon.svelte'

  // Following AI_Guidelines: Component only reads from store and calls helper functions
  $: filters = $feedFilters
</script>

<div class="flex items-center gap-2 px-3 md:px-6 py-2 border-b border-dark-border/40 overflow-x-auto">
  <!-- Replies Filter -->
  <button
    type="button"
    on:click={toggleReplies}
    class={`flex flex-1 items-center justify-center gap-1.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
      filters.showReplies
        ? 'bg-dark-lighter/60 text-text-soft border border-dark-border/60'
        : 'text-text-muted hover:text-text-soft hover:bg-dark-lighter/30 border border-transparent'
    }`}
    aria-label={filters.showReplies ? 'Hide replies' : 'Show replies'}
  >
    <CommentIcon size={14} />
    <span class="hidden md:inline">Replies</span>
    {#if !filters.showReplies}
      <span class="opacity-50">✕</span>
    {/if}
  </button>

  <!-- Long reads filter -->
  <button
    type="button"
    on:click={toggleLongReads}
    class={`flex flex-1 items-center justify-center gap-1.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
      filters.showLongReads
        ? 'bg-dark-lighter/60 text-text-soft border border-dark-border/60'
        : 'text-text-muted hover:text-text-soft hover:bg-dark-lighter/30 border border-transparent'
    }`}
    aria-label={filters.showLongReads ? 'Hide long reads' : 'Show long reads'}
  >
    <BookOpenIcon size={14} />
    <span class="hidden md:inline">Long reads</span>
    {#if !filters.showLongReads}
      <span class="opacity-50 text-[0.7rem]">Hidden</span>
    {/if}
  </button>

  <!-- Reposts Filter -->
  <button
    type="button"
    on:click={toggleReposts}
    class={`flex flex-1 items-center justify-center gap-1.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
      filters.showReposts
        ? 'bg-dark-lighter/60 text-text-soft border border-dark-border/60'
        : 'text-text-muted hover:text-text-soft hover:bg-dark-lighter/30 border border-transparent'
    }`}
    aria-label={filters.showReposts ? 'Hide reposts' : 'Show reposts'}
  >
    <RepostIcon size={14} />
    <span class="hidden md:inline">Reposts</span>
    {#if !filters.showReposts}
      <span class="opacity-50">✕</span>
    {/if}
  </button>

  <!-- Media Filter -->
  <button
    type="button"
    on:click={toggleMedia}
    class={`flex flex-1 items-center justify-center gap-1.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
      filters.showMedia
        ? 'bg-dark-lighter/60 text-text-soft border border-dark-border/60'
        : 'text-text-muted hover:text-text-soft hover:bg-dark-lighter/30 border border-transparent'
    }`}
    aria-label={filters.showMedia ? 'Hide media posts' : 'Show media posts'}
  >
    <ImageIcon size={14} />
    <span class="hidden md:inline">Media</span>
    {#if !filters.showMedia}
      <span class="opacity-50">✕</span>
    {/if}
  </button>

  <!-- Bots Filter -->
  <button
    type="button"
    on:click={toggleBots}
    class={`flex flex-1 items-center justify-center gap-1.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap ${
      filters.showBots
        ? 'bg-dark-lighter/60 text-text-soft border border-dark-border/60'
        : 'text-text-muted hover:text-text-soft hover:bg-dark-lighter/30 border border-transparent'
    }`}
    aria-label={filters.showBots ? 'Hide bots' : 'Show bots'}
  >
    <BotIcon size={14} />
    <span class="hidden md:inline">Bots</span>
    {#if !filters.showBots}
      <span class="opacity-50">✕</span>
    {/if}
  </button>
</div>
