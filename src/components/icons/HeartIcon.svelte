<script lang="ts">
  export let size: number = 16
  export let color: string = 'currentColor'
  export let strokeWidth: number = 2
  export let filled: boolean = false
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? color : 'none'}
  stroke={color}
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
</svg>

<style>
  svg {
    display: inline-block;
    vertical-align: middle;
  }
</style>
