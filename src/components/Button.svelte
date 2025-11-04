<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'ghost' = 'primary'
  export let size: 'sm' | 'md' | 'lg' = 'md'
  export let disabled = false
  export let loading = false
  export let type: 'button' | 'submit' | 'reset' = 'button'

  const variantClasses = {
    primary:
      'bg-primary text-dark shadow-glow hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
    secondary:
      'border border-dark-border bg-dark-lighter text-text-soft hover:border-primary/60 hover:text-text-soft',
    ghost: 'text-text-muted hover:text-text-soft hover:bg-dark-lighter/70',
  }

  const sizeClasses = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  }
</script>

<button
  {type}
  {disabled}
  class="inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50
    {variantClasses[variant]} {sizeClasses[size]}"
  on:click
>
  {#if loading}
    <span class="inline-block animate-spin mr-2">⏳</span>
  {/if}
  <slot />
</button>

<style>
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }
</style>
