<script lang="ts">
  import { onMount } from 'svelte'
  import { getNDK } from '$lib/ndk'
  import type { NDKUserProfile } from '@nostr-dev-kit/ndk'

  export let pubkey: string
  export let showNip05 = true
  export let size: 'sm' | 'md' | 'lg' = 'md'

  let profile: NDKUserProfile | null = null
  let loading = true

  onMount(async () => {
    try {
      const ndk = getNDK()
      const user = ndk.getUser({ pubkey })

      // Try to get cached profile first
      if (user.profile) {
        profile = user.profile
        loading = false
      }

      // Fetch fresh profile in background
      await user.fetchProfile()
      profile = user.profile
      loading = false
    } catch (err) {
      console.warn('Failed to fetch profile for', pubkey.slice(0, 8))
      loading = false
    }
  })

  $: displayName = profile?.name || profile?.displayName || pubkey.slice(0, 8)
  $: avatarUrl = profile?.image || profile?.picture || null
  $: nip05 = showNip05 ? profile?.nip05 : null

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-16 h-16 text-lg',
  }

  const nameClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }
</script>

<div class="flex items-center gap-2">
  <!-- Avatar -->
  <div class="flex-shrink-0">
    {#if avatarUrl}
      <img
        src={avatarUrl}
        alt={displayName}
        class="{sizeClasses[size]} rounded-full object-cover"
        on:error={(e) => {
          e.target.style.display = 'none'
        }}
      />
    {:else}
      <div class="{sizeClasses[size]} rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
        <span class="font-bold text-primary">{pubkey.slice(0, 2).toUpperCase()}</span>
      </div>
    {/if}
  </div>

  <!-- Name and NIP-05 -->
  {#if size !== 'sm'}
    <div class="min-w-0">
      <p class="{nameClasses[size]} font-medium text-white truncate">
        {displayName}
      </p>
      {#if nip05}
        <p class="text-xs text-text-tertiary truncate">
          {nip05}
        </p>
      {/if}
    </div>
  {/if}
</div>

<style>
  img {
    transition: opacity 0.2s;
  }
</style>
