<script lang="ts">
  export let size: number = 16
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
  <circle cx="9" cy="12" r="7" />
  <circle cx="15" cy="12" r="7" />
</svg>

<style>
  svg {
    display: inline-block;
    vertical-align: middle;
  }
</style>
