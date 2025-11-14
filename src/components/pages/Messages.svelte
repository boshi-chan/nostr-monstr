<script lang="ts">
  import { onMount } from 'svelte'
  import { activeConversation, messagesLoading } from '$stores/messages'
  import { currentUser } from '$stores/auth'
  import { loadConversations } from '$lib/messaging-simple'
  import ConversationList from '$components/ConversationList.svelte'
  import ChatView from '$components/ChatView.svelte'
  import MessageInput from '$components/MessageInput.svelte'
  import ChevronLeftIcon from 'lucide-svelte/icons/chevron-left'

  let isMobile = false
  let initialized = false

  function handleResize() {
    isMobile = window.innerWidth < 768
  }

  function goBack() {
    activeConversation.set(null)
  }

  $: {
    const user = $currentUser
    if (!user) {
      initialized = false
    } else if (!initialized) {
      initialized = true
      loadConversations().catch(err => logger.error('Failed to load conversations:', err))
    }
  }

  onMount(() => {
    window.addEventListener('resize', handleResize)
    handleResize()
    return () => window.removeEventListener('resize', handleResize)
  })
</script>

<div class="flex h-full w-full overflow-hidden">
  <div
    class={`h-full transition-all duration-300 md:w-[350px] ${
      isMobile && $activeConversation ? 'hidden md:flex md:flex-col' : 'w-full md:w-[350px] md:flex md:flex-col'
    }`}
  >
    {#if $messagesLoading && !initialized}
      <div class="flex h-full items-center justify-center">
        <div class="text-center">
          <div class="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p class="text-sm text-text-muted">Loading conversations...</p>
        </div>
      </div>
    {:else}
      <ConversationList />
    {/if}
  </div>

  <div
    class={`flex h-full flex-col overflow-hidden transition-all duration-300 md:flex-1 ${
      isMobile && !$activeConversation ? 'hidden md:flex md:flex-col' : 'w-full md:flex-1 md:flex md:flex-col'
    }`}
  >
    {#if $activeConversation}
      {#if isMobile}
        <div class="flex-shrink-0 border-b border-dark-border/30 bg-dark-light/40 px-4 py-3">
          <button
            on:click={goBack}
            class="flex items-center gap-2 rounded-lg p-1 text-sm font-medium text-primary transition-colors hover:bg-dark-light/60"
          >
            <ChevronLeftIcon class="h-5 w-5" />
            Back
          </button>
        </div>
      {/if}

      <div class="flex-1 overflow-hidden">
        <ChatView />
      </div>

      <div class="flex-shrink-0">
        <MessageInput />
      </div>
    {:else}
      <div class="hidden flex-1 items-center justify-center md:flex">
        <div class="text-center">
          <div class="mb-4 text-6xl">💬</div>
          <h2 class="text-xl font-semibold text-text-soft">Select a conversation</h2>
          <p class="mt-2 text-sm text-text-muted">
            Choose someone from the list to start messaging
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  @media (max-width: 767px) {
    :global(body) {
      overflow: hidden;
    }
  }
</style>

