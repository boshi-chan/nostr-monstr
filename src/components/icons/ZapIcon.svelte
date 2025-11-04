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
  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
</svg>

<style>
  svg {
    display: inline-block;
    vertical-align: middle;
  }
</style>
