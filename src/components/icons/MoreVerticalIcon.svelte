<script lang="ts">
  export let size: number = 20
  export let color: string = 'currentColor'
  export let strokeWidth: number = 2
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <circle cx="12" cy="5" r="1.5" />
  <circle cx="12" cy="12" r="1.5" />
  <circle cx="12" cy="19" r="1.5" />
</svg>
