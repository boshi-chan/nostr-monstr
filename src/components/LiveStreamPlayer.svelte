<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { NDKEvent, type NDKFilter, type NDKSubscription } from '@nostr-dev-kit/ndk'
  import { metadataCache } from '$stores/feed'
  import { getDisplayName, getAvatarUrl, fetchUserMetadata } from '$lib/metadata'
  import { getNDK, getCurrentNDKUser } from '$lib/ndk'
  import { formatDate } from '$lib/utils'
  import { nip19 } from 'nostr-tools'
  import FollowButton from './FollowButton.svelte'

  export let event: NDKEvent
  export let onClose: () => void

  let title = ''
  let summary = ''
  let streaming = ''
  let userMetadata: any = null
  let zapStreamUrl = ''
  let chatMessages: Array<{ id: string; content: string; author: string; pubkey: string; created: number }> = []
  let chatSubscription: NDKSubscription | null = null
  let chatContainer: HTMLDivElement | null = null
  let messageInput = ''
  let isSendingMessage = false
  let videoEl: HTMLVideoElement | null = null
  let hlsInstance: any = null
  let playbackError = ''
  let isPlaying = true
  let isMuted = false
  let streamerPubkey = ''
  let previewImage = ''
  let triedNativeFallback = false
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')
  $: viewers = parseInt(event.tagValue('current_participants') || '0')

  function resolveStreamerPubkey(evt: NDKEvent): string {
    const pTag = Array.isArray(evt.tags) ? (evt.tags.find(tag => Array.isArray(tag) && tag[0] === 'p' && tag[1]) as string[] | undefined) : undefined
    return pTag?.[1] ?? evt.pubkey
  }

  // Basic tag extraction
  $: {
    title = event.tagValue('title') || 'Untitled Stream'
    summary = event.tagValue('summary') || ''
    streaming = event.tagValue('streaming') || ''
    streamerPubkey = resolveStreamerPubkey(event)
    userMetadata = $metadataCache.get(streamerPubkey)
    const picture = event.tagValue('picture') || event.tagValue('thumbnail') || event.tagValue('thumb')
    previewImage = event.tagValue('image') || picture || getAvatarUrl(streamerPubkey, userMetadata) || ''
  }

  // Build zap.stream URL from d-tag if provided
  $: {
    const dTag = event.tagValue('d')
    if (streaming) {
      try {
        const urlObj = new URL(streaming)
        const hostname = urlObj.hostname.toLowerCase()
        if (hostname.includes('zap.stream')) {
          zapStreamUrl = streaming
        } else if (dTag) {
          try {
            const naddr = nip19.naddrEncode({
              kind: event.kind as number,
              pubkey: event.pubkey,
              identifier: dTag,
            })
            zapStreamUrl = `https://zap.stream/${naddr}`
          } catch (err) {
            console.error('[LiveStreamPlayer] Failed to encode naddr:', err)
            zapStreamUrl = ''
          }
        } else {
          zapStreamUrl = ''
        }
      } catch {
        zapStreamUrl = ''
      }
    } else if (dTag) {
      try {
        const naddr = nip19.naddrEncode({
          kind: event.kind as number,
          pubkey: event.pubkey,
          identifier: dTag,
        })
        zapStreamUrl = `https://zap.stream/${naddr}`
      } catch (err) {
        console.error('[LiveStreamPlayer] Failed to encode naddr (no streaming):', err)
        zapStreamUrl = ''
      }
    } else {
      zapStreamUrl = ''
    }
  }

  function subscribeToChat(): void {
    const ndk = getNDK()
    if (!ndk) return
    const dTag = event.tagValue('d')
    if (!dTag) return
    const aTag = `${event.kind}:${event.pubkey}:${dTag}`
    const filter: NDKFilter = { kinds: [1311 as any], '#a': [aTag], limit: 100 }
    chatSubscription = ndk.subscribe(filter, { closeOnEose: false })
    chatSubscription.on('event', (chatEvent: NDKEvent) => {
      const content = chatEvent.content || ''
      if (chatMessages.some(m => m.id === chatEvent.id)) return
      chatMessages = [
        ...chatMessages,
        {
          id: chatEvent.id,
          content,
          author: getDisplayName(chatEvent.pubkey),
          pubkey: chatEvent.pubkey,
          created: chatEvent.created_at || 0,
        },
      ].sort((a, b) => a.created - b.created)
      setTimeout(() => {
        chatContainer && (chatContainer.scrollTop = chatContainer.scrollHeight)
      }, 50)
      void fetchUserMetadata(chatEvent.pubkey)
    })
  }

  async function sendMessage(): Promise<void> {
    if (!messageInput.trim() || isSendingMessage) return
    const ndk = getNDK()
    const currentUser = getCurrentNDKUser()
    if (!ndk || !currentUser) {
      alert('Please sign in to send messages')
      return
    }
    if (!(ndk as any).signer) {
      alert('Please reconnect your signer to chat')
      return
    }
    isSendingMessage = true
    try {
      const dTag = event.tagValue('d')
      if (!dTag) throw new Error('Invalid livestream event')
      const aTag = `${event.kind}:${event.pubkey}:${dTag}`
      const chatEvent = new NDKEvent(ndk)
      chatEvent.kind = 1311
      chatEvent.content = messageInput.trim()
      chatEvent.created_at = Math.floor(Date.now() / 1000)
      chatEvent.tags = [
        ['a', aTag],
        ['p', streamerPubkey],
        ['p', event.pubkey],
      ]
      await chatEvent.publish()
      messageInput = ''
    } catch (err) {
      console.error('[LiveStreamPlayer] Error sending message:', err)
      alert(`Failed to send message: ${(err as Error)?.message || 'unknown error'}`)
    } finally {
      isSendingMessage = false
    }
  }

  function handleMessageKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  async function setupPlayer(): Promise<void> {
    playbackError = ''
    triedNativeFallback = false
    if (!streaming || !videoEl) return
    try {
      const needsHls = streaming.toLowerCase().includes('.m3u8')
      videoEl.muted = isMuted
      videoEl.controls = true
      videoEl.crossOrigin = 'anonymous'
      const canNativeHls =
        needsHls && typeof videoEl.canPlayType === 'function' && videoEl.canPlayType('application/vnd.apple.mpegurl')
      // On Android WebView, prefer native first before loading hls.js (workers can be flaky)
      if (needsHls && (isAndroid || !canNativeHls)) {
        // Try native source first on Android
        if (isAndroid) {
          videoEl.src = streaming
          try {
            await videoEl.play()
            isPlaying = true
            return
          } catch {
            // fall through to hls.js
          }
        }
        try {
          const mod = await import('hls.js')
          const Hls = (mod as any)?.default || (mod as any)?.Hls || mod
          if (Hls?.isSupported?.()) {
            hlsInstance = new Hls({ enableWorker: !isAndroid, lowLatencyMode: true })
            hlsInstance.loadSource(streaming)
            hlsInstance.attachMedia(videoEl)
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => void videoEl?.play().catch(() => {}))
            hlsInstance.on(Hls.Events.ERROR, (_ev: any, data: any) => {
              if (data?.fatal) {
                if (!triedNativeFallback) {
                  triedNativeFallback = true
                  void (async () => {
                    try {
                      hlsInstance?.destroy()
                      hlsInstance = null
                      videoEl!.src = streaming
                      await videoEl!.play().catch(() => {})
                    } catch (err) {
                      playbackError = 'Stream unavailable (HLS fatal error)'
                    }
                  })()
                  return
                }
                playbackError = 'Stream unavailable (HLS fatal error)'
              }
            })
            return
          }
        } catch (err) {
          console.warn('[LiveStreamPlayer] HLS.js load failed, falling back to native', err)
        }
      }
      videoEl.src = streaming
      await jumpToLive()
      await videoEl.play().catch(() => {})
      isPlaying = !videoEl.paused
    } catch (err) {
      console.error('[LiveStreamPlayer] Failed to start stream:', err)
      playbackError = 'Unable to start stream'
    }
  }

  async function togglePlay(): Promise<void> {
    if (!videoEl) return
    if (videoEl.paused) {
      await videoEl.play().catch(() => {})
      isPlaying = true
    } else {
      videoEl.pause()
      isPlaying = false
    }
  }

  function toggleMute(): void {
    if (!videoEl) return
    videoEl.muted = !videoEl.muted
    isMuted = videoEl.muted
  }

  function handleVideoError(): void {
    playbackError = 'Stream unavailable (failed to load video)'
  }

  async function jumpToLive(): Promise<void> {
    if (!videoEl) return
    const seekable = videoEl.seekable
    if (seekable && seekable.length > 0) {
      const end = seekable.end(seekable.length - 1)
      videoEl.currentTime = end
    }
  }

  onMount(() => {
    void fetchUserMetadata(event.pubkey)
    void fetchUserMetadata(streamerPubkey)
    subscribeToChat()
    void setupPlayer()
  })

  onDestroy(() => {
    chatSubscription?.stop?.()
    chatSubscription = null
    if (hlsInstance) {
      hlsInstance.destroy()
      hlsInstance = null
    }
  })
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="relative z-10 mx-auto w-full max-w-6xl flex flex-col gap-4 rounded-2xl border border-dark-border/60 bg-[#0b0d12] shadow-2xl p-3 md:p-4">
  <div class="flex flex-1 flex-col md:grid md:grid-cols-3 md:gap-4 min-h-0">
    <!-- Left: video and about -->
    <div class="md:col-span-2 flex flex-col bg-[#0b0d12] gap-4">
      <div class="w-full">
        <div class="relative rounded-2xl border border-dark-border/60 bg-black/80 overflow-hidden shadow-lg">
          <div class="relative flex items-center justify-center bg-black w-full" style="aspect-ratio: 16/9;">
            <button
              on:click={onClose}
              class="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
              aria-label="Close player"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            {#if streaming && !playbackError}
              <video
                bind:this={videoEl}
                class="h-full w-full object-contain bg-black"
                playsinline
                preload="auto"
                controls
                on:error={handleVideoError}
              >
                <track kind="captions" srclang="en" label="Captions" />
              </video>
            {:else if zapStreamUrl}
              <iframe
                src={zapStreamUrl}
                class="h-full w-full"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowfullscreen
                title={title}
              ></iframe>
            {:else}
              <div class="text-center p-8 text-text-muted">Stream offline or missing streaming URL</div>
            {/if}

          </div>

          {#if playbackError && !previewImage}
            <div class="bg-rose-500/10 text-rose-100 text-sm px-4 py-3 border-t border-rose-500/30 flex items-center gap-3">
              <span class="flex-1">{playbackError}</span>
              {#if streaming}
                <a
                  href={streaming}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="rounded-lg border border-rose-400/50 px-3 py-1 text-rose-100 hover:bg-rose-400/10"
                >
                  Open stream
                </a>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Streamer bar -->
      <div class="px-1 pb-2 md:px-0 md:pb-4">
        <div class="rounded-2xl border border-dark-border/60 bg-dark/80 p-2.5 md:p-3 shadow-lg">
          <div class="flex items-center gap-3">
            <div class="h-9 w-9 md:h-10 md:w-10 overflow-hidden rounded-full bg-dark-lighter flex-shrink-0">
              {#if getAvatarUrl(userMetadata)}
                <img src={getAvatarUrl(userMetadata)} alt={getDisplayName(streamerPubkey, userMetadata)} class="h-full w-full object-cover" />
              {:else}
                <div class="flex h-full w-full items-center justify-center bg-primary/20 text-base font-semibold text-primary">
                  {getDisplayName(streamerPubkey, userMetadata).slice(0, 2).toUpperCase()}
                </div>
              {/if}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="text-sm sm:text-base font-bold text-white truncate">{getDisplayName(streamerPubkey, userMetadata)}</h3>
                {#if viewers > 0}
                  <span class="text-[11px] text-text-muted flex-shrink-0">• {viewers} watching</span>
                {/if}
              </div>
              <p class="text-xs text-text-muted truncate">{streamerPubkey}</p>
              {#if summary}
                <p class="text-[11px] text-text-soft truncate mt-1">{summary}</p>
              {/if}
            </div>
            <div class="flex flex-col gap-1">
              <FollowButton pubkey={streamerPubkey} size="sm" layout="inline" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: chat -->
    <div class="flex flex-col md:flex-1 md:basis-1/3 border-t md:border-t-0 md:border-l border-dark-border/60 bg-dark-light/95 w-full md:w-auto rounded-2xl md:rounded-none min-h-0">
      <div class="border-b border-dark-border/60 px-4 py-3 flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-white">Live Chat</h3>
          <p class="text-xs text-text-muted">{chatMessages.length} {chatMessages.length === 1 ? 'message' : 'messages'}</p>
        </div>
        <div class="hidden md:flex gap-2">
          <button class="rounded-lg bg-amber-500/20 px-3 py-1 text-sm font-semibold text-amber-400 hover:bg-amber-500/30 transition-colors">Zap</button>
          <button class="rounded-lg bg-orange-500/20 px-3 py-1 text-sm font-semibold text-orange-400 hover:bg-orange-500/30 transition-colors">Ember</button>
        </div>
      </div>

      <div
        bind:this={chatContainer}
        class="flex-1 overflow-y-auto px-3 py-1 space-y-3 bg-[#0f131c] max-h-[20vh] md:max-h-[21rem] rounded-2xl md:rounded-none"
      >
        {#if chatMessages.length === 0}
          <div class="text-center py-8">
            <p class="text-sm text-text-muted">No messages yet</p>
            <p class="text-xs text-text-muted/60 mt-1">Be the first to chat!</p>
          </div>
        {:else}
          {#each chatMessages as message (message.id)}
            {@const msgMetadata = $metadataCache.get(message.pubkey)}
            <div class="flex items-start gap-2">
              <div class="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-dark-lighter border border-dark-border/60">
                {#if getAvatarUrl(msgMetadata)}
                  <img src={getAvatarUrl(msgMetadata)} alt={getDisplayName(message.pubkey, msgMetadata)} class="h-full w-full object-cover" />
                {:else}
                  <div class="flex h-full w-full items-center justify-center bg-primary/20 text-[10px] font-semibold text-primary">
                    {getDisplayName(message.pubkey, msgMetadata).slice(0, 2).toUpperCase()}
                  </div>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2">
                  <span class="text-xs font-semibold text-text-soft truncate">{getDisplayName(message.pubkey, msgMetadata)}</span>
                  <span class="text-[10px] text-text-muted/60 flex-shrink-0">{formatDate(message.created * 1000)}</span>
                </div>
                <p class="text-xs text-text-muted break-words">{message.content}</p>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <div class="border-t border-dark-border/60 px-3 py-2 bg-dark/90">
        <div class="flex items-end gap-2">
          <textarea
            bind:value={messageInput}
            on:keydown={handleMessageKeydown}
            placeholder="Send a message..."
            class="flex-1 resize-none rounded-lg bg-dark-lighter/60 px-3 py-2 text-sm text-white placeholder-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40 border border-dark-border/40 h-9"
            rows="1"
            disabled={isSendingMessage}
          ></textarea>
          <button
            on:click={sendMessage}
            disabled={!messageInput.trim() || isSendingMessage}
            class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13"></path>
              <path d="M22 2L15 22 11 13 2 9l20-7z"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
