<script lang="ts">
  import { formatDate } from '$lib/utils'
  import { parseContent } from '$lib/content'
  import UserProfile from './UserProfile.svelte'
  import type { NostrEvent } from '$types/nostr'

  export let event: NostrEvent
  export let onSelect: ((event: NostrEvent) => void) | undefined = undefined
  export let onProfileSelect: ((pubkey: string) => void) | undefined = undefined

  const parsed = parseContent(event)

  // Strip markdown syntax for clean preview
  function stripMarkdown(text: string): string {
    return text
      // Remove HTML/markdown center tags
      .replace(/<\/?center>/gi, '')
      // Remove markdown headers (## )
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic (**text** or *text*)
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // Remove links [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove inline code `code`
      .replace(/`([^`]+)`/g, '$1')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Remove blockquotes
      .replace(/^\s*>\s+/gm, '')
      // Clean up extra whitespace
      .trim()
  }

  $: lines = parsed.text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  $: rawHeadline = lines[0] ?? 'Untitled note'
  $: headline = stripMarkdown(rawHeadline)

  $: bodySource = lines.slice(1).join(' ')
  $: previewSource = bodySource.length > 0 ? bodySource : lines.slice(0).join(' ')
  $: cleanPreview = stripMarkdown(previewSource)
  $: preview =
    cleanPreview.length > 200 ? `${cleanPreview.slice(0, 197).trimEnd()}…` : cleanPreview

  $: wordCount = parsed.text.split(/\s+/).filter(Boolean).length
  $: readMinutes = Math.max(1, Math.round(wordCount / 200))

  function handleClick() {
    onSelect?.(event)
  }

  function handleKeyDown(eventKey: KeyboardEvent) {
    if (eventKey.key === 'Enter' || eventKey.key === ' ') {
      eventKey.preventDefault()
      onSelect?.(event)
    }
  }

  function handleProfileClick(mouseEvent: MouseEvent) {
    mouseEvent.stopPropagation()
    onProfileSelect?.(event.pubkey)
  }

  function handleProfileKeyDown(keyboardEvent: KeyboardEvent) {
    if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
      keyboardEvent.preventDefault()
      onProfileSelect?.(event.pubkey)
    }
  }
</script>

<div
  role="button"
  tabindex="0"
  class="group cursor-pointer rounded-3xl border border-dark-border/80 bg-dark/70 p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:bg-dark/60 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
  on:click={handleClick}
  on:keydown={handleKeyDown}
>
  <!-- Headline first -->
  <h3 class="text-lg font-semibold text-white transition-colors duration-200 group-hover:text-primary">
    {headline}
  </h3>

  <!-- Author avatar + name -->
  <div
    role="button"
    tabindex="0"
    class="mt-3 inline-flex items-center gap-2 rounded-xl px-2 py-1 transition-colors duration-200 hover:bg-dark-lighter/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
    on:click={handleProfileClick}
    on:keydown={handleProfileKeyDown}
  >
    <UserProfile pubkey={event.pubkey} size="sm" showNip05={false} />
  </div>

  <!-- Preview text -->
  {#if preview}
    <p class="mt-3 text-sm leading-relaxed text-text-soft/90 line-clamp-3">
      {preview}
    </p>
  {/if}

  <!-- Bottom details (date, read time, links) -->
  <div class="mt-4 flex items-center gap-3 text-xs text-text-muted">
    <div class="text-text-muted">{formatDate(event.created_at)}</div>
    <span class="text-text-muted/40">•</span>
    <span class="inline-flex items-center gap-1 rounded-full bg-dark-lighter/60 px-3 py-1 text-text-tertiary">
      ~{readMinutes} min read
    </span>
    {#if parsed.embeds.length > 0}
      <span class="inline-flex items-center gap-1 rounded-full bg-dark-lighter/60 px-3 py-1 text-text-tertiary">
        {parsed.embeds.length} link{parsed.embeds.length > 1 ? 's' : ''}
      </span>
    {/if}
  </div>
</div>

<style>
  :global(.line-clamp-3) {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-clamp: 3;
  }
</style>
