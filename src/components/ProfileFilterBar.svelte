<script lang="ts">
  import { feedFilters, setProfileMode } from '$stores/feedFilters'
  import CommentIcon from './icons/CommentIcon.svelte'
  import RepostIcon from './icons/RepostIcon.svelte'
  import ImageIcon from './icons/ImageIcon.svelte'

  // Following AI_Guidelines: Component only reads from store and calls helper functions
  $: currentMode = $feedFilters.profileMode
</script>

<div class="flex items-center gap-2 px-0 py-3 overflow-x-auto">
  <!-- All Posts Tab -->
  <button
    type="button"
    on:click={() => setProfileMode('all')}
    class={`flex flex-1 items-center justify-center gap-1.5 px-2 md:px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
      currentMode === 'all'
        ? 'bg-primary text-white shadow-md'
        : 'text-text-muted hover:text-text-soft hover:bg-dark-lighter/30'
    }`}
    aria-label="Show all posts"
  >
    <span>All</span>
  </button>

  <!-- Replies Tab -->
  <button
    type="button"
    on:click={() => setProfileMode('replies')}
    class={`flex flex-1 items-center justify-center gap-1.5 px-2 md:px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
      currentMode === 'replies'
        ? 'bg-primary text-white shadow-md'
        : 'text-text-muted hover:text-text-soft hover:bg-dark-lighter/30'
    }`}
    aria-label="Show replies"
  >
    <CommentIcon size={14} />
    <span class="hidden md:inline">Replies</span>
  </button>

  <!-- Media Tab -->
  <button
    type="button"
    on:click={() => setProfileMode('media')}
    class={`flex flex-1 items-center justify-center gap-1.5 px-2 md:px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
      currentMode === 'media'
        ? 'bg-primary text-white shadow-md'
        : 'text-text-muted hover:text-text-soft hover:bg-dark-lighter/30'
    }`}
    aria-label="Show media posts"
  >
    <ImageIcon size={14} />
    <span class="hidden md:inline">Media</span>
  </button>

  <!-- Reposts Tab -->
  <button
    type="button"
    on:click={() => setProfileMode('reposts')}
    class={`flex flex-1 items-center justify-center gap-1.5 px-2 md:px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
      currentMode === 'reposts'
        ? 'bg-primary text-white shadow-md'
        : 'text-text-muted hover:text-text-soft hover:bg-dark-lighter/30'
    }`}
    aria-label="Show reposts"
  >
    <RepostIcon size={14} />
    <span class="hidden md:inline">Reposts</span>
  </button>
</div>
