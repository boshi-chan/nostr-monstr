<script lang="ts">
  import { incomingCall } from '$stores/voice-calls'
  import { acceptCall, declineCall } from '$lib/voice-calls'
  import { onMount, onDestroy } from 'svelte'

  let isAccepting = false
  let isDeclining = false
  let timeLeft = 30
  let countdownInterval: number

  onMount(() => {
    // Start countdown
    countdownInterval = window.setInterval(() => {
      timeLeft--
      if (timeLeft <= 0) {
        void handleDecline()
      }
    }, 1000)
  })

  onDestroy(() => {
    if (countdownInterval) {
      clearInterval(countdownInterval)
    }
  })

  async function handleAccept() {
    if (!$incomingCall) return
    try {
      isAccepting = true
      await acceptCall($incomingCall.callId)
    } catch (err) {
      logger.error('Failed to accept call:', err)
    } finally {
      isAccepting = false
    }
  }

  async function handleDecline() {
    if (!$incomingCall) return
    try {
      isDeclining = true
      await declineCall($incomingCall.callId, 'user-declined')
    } catch (err) {
      logger.error('Failed to decline call:', err)
    } finally {
      isDeclining = false
    }
  }
</script>

{#if $incomingCall}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-dark/80 backdrop-blur-md px-4">
    <!-- Modal container -->
    <div class="w-full max-w-sm rounded-3xl bg-dark-light/95 p-8 shadow-2xl">
      <!-- Header -->
      <div class="mb-6 text-center">
        <h2 class="text-xl font-semibold text-text-soft">Incoming Call</h2>
      </div>

      <!-- Caller info -->
      <div class="mb-8 flex flex-col items-center">
        <!-- Avatar with ringing animation -->
        <div class="mb-6 relative">
          <img
            src={$incomingCall.callerAvatar}
            alt={$incomingCall.callerName}
            class="h-32 w-32 rounded-full object-cover border-4 border-primary/40 animate-pulse"
          />
          <div class="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
        </div>

        <!-- Caller name -->
        <p class="mb-2 text-2xl font-bold text-text-soft">
          {$incomingCall.callerName}
        </p>

        <!-- Ringing status -->
        <p class="mb-4 text-sm text-text-muted">
          <span class="inline-block animate-pulse">Calling...</span>
        </p>

        <!-- Countdown -->
        <p class="text-xs text-text-muted/60">
          Declining in {timeLeft}s
        </p>
      </div>

      <!-- Action buttons -->
      <div class="flex gap-4 justify-center">
        <!-- Decline button -->
        <button
          type="button"
          disabled={isDeclining || isAccepting}
          on:click={handleDecline}
          class="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400 transition-all duration-200 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Decline call"
        >
          <svg
            class="h-8 w-8"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
          </svg>
        </button>

        <!-- Accept button -->
        <button
          type="button"
          disabled={isAccepting || isDeclining}
          on:click={handleAccept}
          class="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-400 transition-all duration-200 hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Accept call"
        >
          <svg
            class="h-8 w-8"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
          </svg>
        </button>
      </div>

      <!-- Loading states -->
      {#if isAccepting}
        <p class="mt-4 text-center text-sm text-primary animate-pulse">
          Accepting call...
        </p>
      {/if}

      {#if isDeclining}
        <p class="mt-4 text-center text-sm text-red-400 animate-pulse">
          Declining call...
        </p>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @keyframes ping {
    75%,
    100% {
      transform: scale(2);
      opacity: 0;
    }
  }

  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .animate-ping {
    animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
  }
</style>

