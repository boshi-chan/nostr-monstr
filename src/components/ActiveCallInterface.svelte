<script lang="ts">
  import { activeCall, formattedCallDuration } from '$stores/voice-calls'
  import { endCall, toggleAudio } from '$lib/voice-calls'

  let audioEnabled = true
  let isEnding = false

  async function handleToggleAudio() {
    audioEnabled = !audioEnabled
    await toggleAudio(audioEnabled)
  }

  async function handleEndCall() {
    if (!$activeCall) return
    try {
      isEnding = true
      await endCall($activeCall.id)
    } catch (err) {
      console.error('Failed to end call:', err)
    } finally {
      isEnding = false
    }
  }

  // Show connection status
  $: connectionStatus = $activeCall
    ? {
        ringing: '📞 Ringing...',
        connecting: '📡 Connecting...',
        connected: '✓ Connected',
        'on-hold': '⏸ On Hold',
        ended: '📴 Ended',
        failed: '❌ Failed',
      }[$activeCall.state]
    : 'No call'
</script>

{#if $activeCall}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-dark/80 backdrop-blur-md px-4">
    <!-- Modal container -->
    <div class="w-full max-w-sm rounded-3xl bg-dark-light/95 p-8 shadow-2xl">
      <!-- Header -->
      <div class="mb-6 text-center">
        <h2 class="text-lg font-semibold text-text-soft">
          {$activeCall.type === 'incoming' ? 'Incoming' : 'Outgoing'} Call
        </h2>
      </div>

      <!-- Participant info -->
      <div class="mb-8 flex flex-col items-center">
        <!-- Avatar -->
        <img
          src={$activeCall.participantAvatar}
          alt={$activeCall.participantName}
          class="mb-6 h-32 w-32 rounded-full object-cover border-4 border-primary/40"
        />

        <!-- Name -->
        <p class="mb-2 text-2xl font-bold text-text-soft">
          {$activeCall.participantName}
        </p>

        <!-- Connection status -->
        <p class="mb-4 text-sm font-medium text-primary">
          {connectionStatus}
        </p>

        <!-- Call duration -->
        {#if $activeCall.state === 'connected'}
          <p class="text-3xl font-mono font-bold text-primary">
            {$formattedCallDuration}
          </p>
        {/if}
      </div>

      <!-- Call controls -->
      <div class="mb-8 flex gap-4 justify-center">
        <!-- Mute/Unmute button -->
        <button
          type="button"
          disabled={isEnding || $activeCall.state !== 'connected'}
          on:click={handleToggleAudio}
          class="flex h-16 w-16 items-center justify-center rounded-full transition-all duration-200 {audioEnabled
            ? 'bg-primary/20 text-primary hover:bg-primary/30'
            : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'} disabled:opacity-50 disabled:cursor-not-allowed"
          title={audioEnabled ? 'Mute' : 'Unmute'}
        >
          {#if audioEnabled}
            <svg class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 16.91c-1.48 1.46-3.51 2.36-5.7 2.36-2.02 0-3.82-.76-5.1-2M19 21H5v-2h14v2z" />
            </svg>
          {:else}
            <svg class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" opacity="0.5" />
              <path
                d="M17 16.91c-1.48 1.46-3.51 2.36-5.7 2.36-2.02 0-3.82-.76-5.1-2"
                opacity="0.5"
              />
              <path d="M19 21H5v-2h14v2z" opacity="0.5" />
              <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2" />
            </svg>
          {/if}
        </button>

        <!-- End call button -->
        <button
          type="button"
          disabled={isEnding}
          on:click={handleEndCall}
          class="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400 transition-all duration-200 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          title="End call"
        >
          <svg class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
          </svg>
        </button>
      </div>

      <!-- Status message -->
      {#if isEnding}
        <p class="text-center text-sm text-red-400 animate-pulse">
          Ending call...
        </p>
      {:else if $activeCall.state === 'failed'}
        <p class="text-center text-sm text-red-400">
          {$activeCall.failureReason || 'Call failed'}
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

  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
</style>
