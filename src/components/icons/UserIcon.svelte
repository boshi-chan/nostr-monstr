<script lang="ts">
  export let size: number = 24
  export let color: string = 'currentColor'
  export let strokeWidth: number = 2
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
  <circle cx="12" cy="7" r="4" />
</svg>

<style>
  svg {
    display: inline-block;
    vertical-align: middle;
  }
</style>
