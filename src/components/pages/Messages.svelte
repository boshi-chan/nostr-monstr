<script lang="ts">
  import { conversations, activeConversation } from '$stores/messages'

  function selectConversation(pubkey: string) {
    activeConversation.set(pubkey)
  }
</script>

<div class="flex h-full flex-col bg-transparent pb-24 md:pb-0 md:px-10 md:py-8">
  <!-- Header -->
  <div class="sticky top-0 z-20 border-b border-dark-border/60 bg-dark/80 backdrop-blur-xl md:rounded-3xl md:border md:border-dark-border/50 md:bg-dark-light/70 md:px-6 md:py-5 md:shadow-inset">
    <h2 class="text-xl font-semibold text-text-soft">Messages</h2>
  </div>

  <!-- Conversations list -->
  <div class="flex-1 overflow-y-auto px-3 md:px-0 md:pt-6">
    {#if $conversations.size === 0}
      <div class="flex h-full items-center justify-center text-text-muted">
        <div class="text-center space-y-2">
          <p class="text-lg">No conversations</p>
          <p class="text-sm">Direct messages will appear here</p>
        </div>
      </div>
    {:else}
      <div class="space-y-3 pb-6">
        {#each Array.from($conversations.entries()) as [pubkey, messages] (pubkey)}
          <button
            class={`surface-card w-full p-5 text-left transition-all duration-200 hover:-translate-y-0.5 ${
              $activeConversation === pubkey ? 'border-primary/60 shadow-glow' : ''
            }`}
            on:click={() => selectConversation(pubkey)}
          >
            <div class="flex items-center gap-3">
              <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-sm font-bold text-primary">
                {pubkey.slice(0, 2).toUpperCase()}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-text-soft">{pubkey.slice(0, 18)}...</p>
                <p class="truncate text-xs text-text-muted">
                  {messages[messages.length - 1]?.content || 'No messages'}
                </p>
              </div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
