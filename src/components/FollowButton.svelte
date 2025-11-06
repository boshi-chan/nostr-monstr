<script lang="ts">
  import { following } from '$stores/feed'
  import { followUser, unfollowUser } from '$lib/follows'
  import { currentUser } from '$stores/auth'

  export let pubkey: string
  export let size: 'sm' | 'md' = 'md'
  export let layout: 'stacked' | 'inline' = 'stacked'

  let isLoading = false
  let error: string | null = null

  $: isFollowing = $following.has(pubkey)
  $: isOwnProfile = $currentUser?.pubkey === pubkey
  $: canFollow = !isOwnProfile && $currentUser?.pubkey

  async function handleFollowClick() {
    if (isLoading || !canFollow) return

    try {
      isLoading = true
      error = null

      if (isFollowing) {
        await unfollowUser(pubkey)
      } else {
        await followUser(pubkey)
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      console.error('Follow action failed:', err)
    } finally {
      isLoading = false
    }
  }

  const buttonClasses = {
    sm: 'px-3 py-1 text-xs font-semibold',
    md: 'px-4 py-2 text-sm font-semibold',
  }

  const baseClass = `rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${buttonClasses[size]}`
</script>

{#if canFollow}
  <div class={layout === 'inline' ? 'inline-flex items-center gap-2' : 'flex flex-col gap-1'}>
    <button
      type="button"
      on:click|stopPropagation={handleFollowClick}
      disabled={isLoading}
      class={`${baseClass} ${
        isFollowing
          ? 'bg-dark-border/60 text-text-soft hover:bg-dark-border/80 hover:text-text-soft'
          : 'bg-primary text-dark hover:bg-primary/90'
      }`}
      title={isFollowing ? 'Unfollow' : 'Follow'}
    >
      {#if isLoading}
        <span>Loading...</span>
      {:else if isFollowing}
        <span>Following</span>
      {:else}
        <span>Follow</span>
      {/if}
    </button>
    {#if error && layout === 'stacked'}
      <p class="text-xs text-red-400">{error}</p>
    {/if}
  </div>
{/if}
