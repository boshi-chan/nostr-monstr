<script lang="ts">
  import { currentUser } from '$stores/auth'
  import { metadataCache } from '$stores/feed'
  import { getDisplayName, getAvatarUrl, getNip05Display, fetchUserMetadata } from '$lib/metadata'
  import { getNDK } from '$lib/ndk'
  import Post from '../Post.svelte'
  import Skeleton from '../Skeleton.svelte'
  import type { NostrEvent } from '$types/nostr'
  import type { User } from '$types/user'
  import type { UserMetadata } from '$types/user'

  const ndk = getNDK()
  const metadataRequested = new Set<string>()
  const linkRegex = /(https?:\/\/[^\s]+)/gi

  let authUser: User | null = null
  let metadata: UserMetadata | undefined
  let displayName = 'Anon'
  let avatarUrl: string | null = null
  let bannerUrl: string | null = null
  let nip05: string | null = null
  let bioLines: string[] = []

  let loadingStats = false
  let loadingPosts = false
  let followingCount = 0
  let followersCount = 0
  let posts: NostrEvent[] = []
  let error: string | null = null
  let lastLoadedPubkey: string | null = null

  $: authUser = $currentUser
  $: metadata = authUser ? $metadataCache.get(authUser.pubkey) : undefined
  $: avatarUrl = getAvatarUrl(metadata) ?? authUser?.picture ?? null
  $: bannerUrl = metadata?.banner || metadata?.cover || metadata?.picture_header || null
  $: nip05 = getNip05Display(metadata?.nip05) || authUser?.nip05 || null
  $: displayName =
    authUser?.pubkey
      ? getDisplayName(authUser.pubkey, metadata) ||
        authUser.name ||
        nip05 ||
        authUser.pubkey.slice(0, 8)
      : 'Anon'
  $: bioLines = (() => {
    const bio = metadata?.about || authUser?.about || ''
    const lines = bio.split('\n')
    return lines.length === 1 && lines[0].trim().length === 0 ? [] : lines
  })()

  $: {
    const pubkey = authUser?.pubkey ?? null

    if (!pubkey) {
      resetState(false)
      lastLoadedPubkey = null
    } else {
      if (!metadata && !metadataRequested.has(pubkey)) {
        metadataRequested.add(pubkey)
        void fetchUserMetadata(pubkey)
      }

      if (lastLoadedPubkey !== pubkey) {
        lastLoadedPubkey = pubkey
        resetState(true)
        void loadStats(pubkey)
        void loadPosts(pubkey)
      }
    }
  }

  function resetState(setLoading: boolean): void {
    posts = []
    error = null
    followingCount = 0
    followersCount = 0
    if (setLoading) {
      loadingStats = true
      loadingPosts = true
    } else {
      loadingStats = false
      loadingPosts = false
    }
  }

  function linkify(line: string): string {
    return line.replace(linkRegex, url => {
      const escaped = url.replace(/"/g, '&quot;')
      return `<a href="${escaped}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${escaped}</a>`
    })
  }

  async function loadStats(pubkey: string): Promise<void> {
    try {
      const [following, followers] = await Promise.all([
        fetchFollowing(pubkey),
        fetchFollowers(pubkey),
      ])
      followingCount = following.size
      followersCount = followers.size
    } catch (err) {
      console.warn('Failed to load profile stats', err)
    } finally {
      loadingStats = false
    }
  }

  async function loadPosts(pubkey: string): Promise<void> {
    try {
      const result = (await ndk.fetchEvents(
        { authors: [pubkey], kinds: [1], limit: 50 },
        { closeOnEose: true }
      )) as Set<any>

      const seen = new Set<string>()
      posts = Array.from(result)
        .map(event => event.rawEvent() as NostrEvent)
        .filter(event => {
          if (seen.has(event.id)) return false
          seen.add(event.id)
          return true
        })
        .sort((a, b) => b.created_at - a.created_at)
    } catch (err) {
      console.error('Failed to load profile posts', err)
      error = 'Unable to load posts right now.'
    } finally {
      loadingPosts = false
    }
  }

  function fetchFollowing(pubkey: string): Promise<Set<string>> {
    return new Promise(resolve => {
      const following = new Set<string>()
      const subscription = ndk.subscribe(
        { authors: [pubkey], kinds: [3], limit: 1 },
        { closeOnEose: true },
        undefined,
        false
      )

      const finish = () => {
        subscription.stop()
        resolve(following)
      }

      subscription.on('event', (event: any) => {
        for (const tag of event.tags) {
          if (tag[0] === 'p' && tag[1]) {
            following.add(tag[1])
          }
        }
      })

      subscription.on('eose', finish)
      ;(subscription as any).on?.('error', finish)
    })
  }

  function fetchFollowers(pubkey: string): Promise<Set<string>> {
    return new Promise(resolve => {
      const followers = new Set<string>()
      const subscription = ndk.subscribe(
        { kinds: [3], '#p': [pubkey], limit: 500 },
        { closeOnEose: true },
        undefined,
        false
      )

      const finish = () => {
        subscription.stop()
        resolve(followers)
      }

      subscription.on('event', (event: any) => {
        if (event.pubkey !== pubkey) {
          followers.add(event.pubkey)
        }
      })

      subscription.on('eose', finish)
      ;(subscription as any).on?.('error', finish)
    })
  }
</script>

{#if authUser}
  <div class="flex h-full flex-col bg-transparent pb-24 md:pb-0">
    <section class="mx-auto w-full max-w-3xl px-4 pt-6 md:px-0 md:pt-8">
      <div class="relative overflow-hidden rounded-3xl border border-dark-border/60 bg-dark-light shadow-xl">
        <div class="h-20 w-full md:h-24">
          {#if bannerUrl}
            <img src={bannerUrl} alt="Profile banner" class="h-full w-full object-cover" />
          {:else}
            <div class="h-full w-full bg-gradient-to-r from-primary/40 via-purple-500/25 to-pink-500/25"></div>
          {/if}
        </div>

        <div class="relative px-5 pb-6 md:px-8 md:pb-8">
          <div class="-mt-12 flex flex-col gap-4 md:-mt-14 md:flex-row md:items-end md:justify-between">
            <div class="flex items-end gap-4">
              <div class="h-24 w-24 overflow-hidden rounded-3xl border-4 border-dark bg-dark shadow-lg md:h-32 md:w-32">
                {#if avatarUrl}
                  <img src={avatarUrl} alt={displayName} class="h-full w-full object-cover" />
                {:else}
                  <div class="flex h-full w-full items-center justify-center bg-primary/20 text-3xl font-bold text-primary">
                    {authUser.pubkey.slice(0, 2).toUpperCase()}
                  </div>
                {/if}
              </div>

              <div class="pb-2">
                <div class="flex flex-wrap items-center gap-3">
                  <h1 class="text-2xl font-semibold text-white md:text-3xl">{displayName}</h1>
                  <button
                    type="button"
                    class="rounded-full border border-dark-border/70 bg-dark px-4 py-2 text-sm font-medium text-text-soft transition-colors duration-200 hover:border-primary/60 hover:text-white"
                  >
                    Edit Profile
                  </button>
                </div>
                <p class="mt-2 text-sm text-text-muted/80">{nip05 || authUser.pubkey.slice(0, 12)}</p>
              </div>
            </div>

            <div class="flex items-center gap-6 rounded-2xl border border-dark-border/70 bg-dark px-6 py-4 shadow-md">
              <div>
                <p class="text-xs uppercase tracking-[0.3em] text-text-muted">Following</p>
                <p class="mt-1 text-lg font-semibold text-white">
                  {loadingStats ? '—' : followingCount}
                </p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-[0.3em] text-text-muted">Followers</p>
                <p class="mt-1 text-lg font-semibold text-white">
                  {loadingStats ? '—' : followersCount}
                </p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-[0.3em] text-text-muted">Posts</p>
                <p class="mt-1 text-lg font-semibold text-white">
                  {loadingPosts ? '—' : posts.length}
                </p>
              </div>
            </div>
          </div>

          {#if bioLines.length > 0}
            <div class="mt-6 space-y-2 rounded-2xl border border-dark-border/60 bg-dark/60 px-6 py-5 text-sm leading-relaxed text-text-soft shadow-inner">
              {#each bioLines as line}
                {#if line.trim().length === 0}
                  <div class="h-2"></div>
                {:else}
                  <p class="whitespace-pre-line break-words">
                    {@html linkify(line)}
                  </p>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </section>

    <section class="mx-auto mt-6 w-full max-w-3xl px-4 md:px-0 md:mt-8 flex-1">
      <div class="flex items-center justify-between px-2 md:px-1">
        <h2 class="text-lg font-semibold text-white md:text-xl">Your Posts</h2>
        <span class="text-xs uppercase tracking-[0.2em] text-text-muted">
          {loadingPosts ? 'Loading' : `${posts.length} total`}
        </span>
      </div>

      {#if loadingPosts}
        <div class="mt-4 space-y-3">
          {#each Array(4) as _}
            <Skeleton />
          {/each}
        </div>
      {:else if error}
        <div class="mt-4 rounded-2xl border border-dark-border/60 bg-dark/60 px-4 py-12 text-center text-text-muted">
          {error}
        </div>
      {:else if posts.length === 0}
        <div class="mt-4 rounded-2xl border border-dark-border/60 bg-dark/60 px-4 py-12 text-center text-text-muted">
          You haven't posted anything yet.
        </div>
      {:else}
        <div class="mt-4 rounded-2xl border border-dark-border/60 bg-dark/60">
          <div class="divide-y divide-dark-border/70">
            {#each posts as post (post.id)}
              <Post event={post} showActions />
            {/each}
          </div>
        </div>
      {/if}
    </section>
  </div>
{:else}
  <div class="flex h-full items-center justify-center text-text-muted">
    <div class="space-y-2 text-center">
      <p class="text-lg font-semibold text-text-soft">Not logged in</p>
      <p class="text-sm">Connect your Nostr key to continue</p>
    </div>
  </div>
{/if}
