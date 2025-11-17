<script lang="ts">
  import { onMount } from 'svelte'
  import ChevronUpIcon from 'lucide-svelte/icons/chevron-up'

  export let target: HTMLElement | null = null
  export let threshold = 600

  let visible = false
  let mounted = false
  let currentTarget: HTMLElement | Window | null = null

  const getDefaultTarget = () => {
    if (target) return target
    if (typeof window !== 'undefined') return window
    return null
  }

  const getScrollTop = (source: HTMLElement | Window | null): number => {
    if (!source) return 0
    if (typeof window !== 'undefined' && source === window) {
      return window.scrollY || window.document.documentElement.scrollTop || 0
    }
    return (source as HTMLElement).scrollTop ?? 0
  }

  const handleScroll = () => {
    const scrollTop = getScrollTop(currentTarget)
    visible = scrollTop > threshold
  }

  const attachTarget = () => {
    if (!mounted) return
    const nextTarget = getDefaultTarget()
    if (nextTarget === currentTarget) {
      return
    }
    detachTarget()
    if (!nextTarget || typeof nextTarget.addEventListener !== 'function') {
      visible = false
      return
    }
    currentTarget = nextTarget
    currentTarget.addEventListener('scroll', handleScroll, { passive: true } as AddEventListenerOptions)
    handleScroll()
  }

  const detachTarget = () => {
    if (currentTarget && typeof currentTarget.removeEventListener === 'function') {
      currentTarget.removeEventListener('scroll', handleScroll)
    }
    currentTarget = null
  }

  onMount(() => {
    mounted = true
    attachTarget()
    return () => {
      mounted = false
      detachTarget()
    }
  })

  $: if (mounted) {
    attachTarget()
  }

  function scrollToTop() {
    const source = currentTarget ?? getDefaultTarget()
    if (!source) return

    if (typeof window !== 'undefined' && source === window) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.document.documentElement.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      ;(source as HTMLElement).scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
</script>

{#if visible}
  <button class="scroll-top-btn" on:click={scrollToTop} aria-label="Back to top">
    <ChevronUpIcon class="h-5 w-5" stroke-width={2} />
  </button>
{/if}

<style>
  .scroll-top-btn {
    position: fixed;
    right: 1rem;
    bottom: calc(9rem + env(safe-area-inset-bottom, 0px));
    z-index: 45;
    height: 2.75rem;
    width: 2.75rem;
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(13, 18, 24, 0.85);
    color: var(--color-primary, #f79b5e);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .scroll-top-btn:hover {
    transform: translateY(-2px) scale(1.03);
  }

  @media (min-width: 768px) {
    .scroll-top-btn {
      bottom: 6rem;
      right: 1.5rem;
      height: 3rem;
      width: 3rem;
    }
  }
</style>
