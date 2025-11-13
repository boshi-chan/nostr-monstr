<script lang="ts">
  import { activeConversationData, messageState } from '$stores/messages'
  import { sendDirectMessage } from '$lib/messaging-simple'
  import SendIcon from 'lucide-svelte/icons/send'

  let messageInput: HTMLTextAreaElement
  let inputValue = ''
  let isComposing = false

  /**
   * Auto-expand textarea as user types
   */
  function handleInput() {
    if (messageInput) {
      messageInput.style.height = 'auto'
      const newHeight = Math.min(messageInput.scrollHeight, 140) // Max ~5 lines
      messageInput.style.height = newHeight + 'px'
    }
  }

  /**
   * Handle Enter key to send message
   * Shift+Enter for newline
   */
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  /**
   * Send the message
   */
  async function handleSendMessage() {
    if (!inputValue.trim() || !$activeConversationData?.participantPubkey || $messageState.isSending) {
      return
    }

    try {
      messageState.update(s => ({ ...s, isSending: true, error: null }))

      await sendDirectMessage($activeConversationData.participantPubkey, inputValue.trim())

      // Clear input
      inputValue = ''
      if (messageInput) {
        messageInput.style.height = 'auto'
      }
    } catch (error) {
      messageState.update(s => ({
        ...s,
        error: error instanceof Error ? error.message : 'Failed to send message',
      }))
      console.error('Failed to send message:', error)
    } finally {
      messageState.update(s => ({ ...s, isSending: false }))
    }
  }

  $: if ($activeConversationData === null) {
    inputValue = ''
  }
</script>

<!-- Message input footer -->
<div class="flex-shrink-0 border-t border-dark-border/30 bg-dark px-4 py-4 md:px-6 md:py-5">
  <!-- Error message -->
  {#if $messageState.error}
    <div class="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
      {$messageState.error}
    </div>
  {/if}

  <!-- Input area -->
  <div class="flex items-end gap-3">
    <!-- Message input textarea -->
    <textarea
      bind:this={messageInput}
      bind:value={inputValue}
      on:input={handleInput}
      on:keydown={handleKeydown}
      on:compositionstart={() => (isComposing = true)}
      on:compositionend={() => (isComposing = false)}
      disabled={!$activeConversationData || $messageState.isSending}
      placeholder="Type a message... (Shift+Enter for new line)"
      class="max-h-36 min-h-10 flex-1 resize-none rounded-2xl bg-dark-light/50 px-4 py-2.5 text-sm text-text-soft placeholder-text-muted outline-none transition-colors disabled:opacity-50 focus:bg-dark-light/70"
      rows="1"
    />

    <!-- Send button -->
    <button
      on:click={handleSendMessage}
      disabled={!inputValue.trim() || !$activeConversationData || $messageState.isSending}
      class={`flex-shrink-0 rounded-full p-2.5 transition-all disabled:opacity-50 ${
        inputValue.trim() && $activeConversationData && !$messageState.isSending
          ? 'bg-primary text-white hover:bg-primary/80'
          : 'bg-dark-light/40 text-text-muted'
      }`}
      title="Send message (Enter)"
    >
      {#if $messageState.isSending}
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {:else}
        <SendIcon class="h-5 w-5" />
      {/if}
    </button>
  </div>

</div>

<style>
  textarea {
    field-sizing: content;
  }

  textarea:disabled {
    cursor: not-allowed;
  }
</style>

