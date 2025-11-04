<script lang="ts">
  export let size: number = 24
  export let color: string = 'currentColor'
  export let strokeWidth: number = 2
  export let filled: boolean = false
</script>

<svg
  {color}
  fill={filled ? color : 'none'}
  height={size}
  stroke={color}
  stroke-linecap="round"
  stroke-linejoin="round"
  stroke-width={strokeWidth}
  viewBox="0 0 24 24"
  width={size}
  xmlns="http://www.w3.org/2000/svg"
>
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
</svg>
