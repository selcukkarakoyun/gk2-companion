<script lang="ts">
  let { disabled = false, onfile }: { disabled?: boolean; onfile: (file: File) => void } = $props();

  let cameraInput = $state<HTMLInputElement>();
  let galleryInput = $state<HTMLInputElement>();

  function picked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) onfile(file);
  }
</script>

<div class="row wrap">
  <button class="primary" {disabled} onclick={() => cameraInput?.click()}>Tara (kamera)</button>
  <button {disabled} onclick={() => galleryInput?.click()}>Galeriden seç</button>
  <input bind:this={cameraInput} type="file" accept="image/*" capture="environment" hidden onchange={picked} />
  <input bind:this={galleryInput} type="file" accept="image/*" hidden onchange={picked} />
</div>
