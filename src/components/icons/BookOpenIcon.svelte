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
  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
</svg>

<style>
  svg {
    display: inline-block;
    vertical-align: middle;
  }
</style>
