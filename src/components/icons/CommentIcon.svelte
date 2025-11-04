<script lang="ts">
  export let size: number = 24
  export let color: string = 'currentColor'
  export let strokeWidth: number = 2
</script>

<svg
  {color}
  fill="none"
  height={size}
  stroke={color}
  stroke-linecap="round"
  stroke-linejoin="round"
  stroke-width={strokeWidth}
  viewBox="0 0 24 24"
  width={size}
  xmlns="http://www.w3.org/2000/svg"
>
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
</svg>
