<script lang="ts">
  export let inputType: string = 'text'
  export let placeholder: string = ''
  export let value: string = ''
  export let disabled: boolean = false
  export let label: string = ''
  export let error: string = ''
  export let inputId: string | null = null

  const fallbackId = `input-${Math.random().toString(36).slice(2)}`
  $: resolvedId = inputId ?? fallbackId

  function handleInput(e: Event) {
    value = (e.target as HTMLInputElement).value
  }
</script>

<div class="space-y-1">
  {#if label}
    <label for={resolvedId} class="block text-xs uppercase tracking-[0.2em] text-text-muted">{label}</label>
  {/if}

  <input
    id={resolvedId}
    type={inputType}
    {value}
    on:input={handleInput}
    {placeholder}
    {disabled}
    class="w-full rounded-xl border border-dark-border bg-dark-lighter px-4 py-3 text-text-soft placeholder-text-tertiary
      focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/40 transition-all
      disabled:opacity-50 disabled:cursor-not-allowed
      {error ? 'border-red-500 focus:ring-red-500' : ''}"
    on:change
    on:focus
    on:blur
  />

  {#if error}
    <p class="text-xs text-red-500">{error}</p>
  {/if}
</div>

<style>
  input::placeholder {
    color: rgba(160, 160, 160, 0.7);
  }
</style>
