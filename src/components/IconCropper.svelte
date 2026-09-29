<script lang="ts">
  import { untrack } from 'svelte';
  import { boxFromPoints } from '../lib/image-math';
  import type { Box } from '../lib/types';

  let {
    image,
    box,
    onapply,
    oncancel,
  }: { image: string; box: Box | null; onapply: (box: Box) => void; oncancel: () => void } = $props();

  // Başlangıç kutusu yalnızca ilk değer olarak alınır; kullanıcı sürükleyerek değiştirir.
  let current = $state<Box | null>(untrack(() => box));
  let frame = $state<HTMLDivElement>();
  let start: { x: number; y: number } | null = null;

  const valid = $derived(current !== null && current.w >= 0.01 && current.h >= 0.01);

  function point(e: PointerEvent) {
    const r = frame!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  function onpointerdown(e: PointerEvent) {
    frame!.setPointerCapture(e.pointerId);
    start = point(e);
  }
  function onpointermove(e: PointerEvent) {
    if (!start) return;
    const p = point(e);
    current = boxFromPoints(start.x, start.y, p.x, p.y);
  }
  function onpointerup() {
    start = null;
  }
</script>

<div class="overlay cropper" role="dialog" aria-modal="true" aria-label="İkonu kırp">
  <div class="overlay-inner">
    <section class="window">
      <header class="titlebar"><h2>İkonu kırp</h2></header>
      <div class="window-body">
        <p class="muted">İkonun üzerine sürükleyerek bir dikdörtgen çiz.</p>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="crop-frame"
          data-testid="crop-frame"
          bind:this={frame}
          {onpointerdown}
          {onpointermove}
          {onpointerup}
          onpointercancel={onpointerup}
        >
          <img src={image} alt="Taranan görsel" draggable="false" />
          {#if current}
            <div
              class="crop-box"
              style:left="{current.x * 100}%"
              style:top="{current.y * 100}%"
              style:width="{current.w * 100}%"
              style:height="{current.h * 100}%"
            ></div>
          {/if}
        </div>
        <div class="row between">
          <button onclick={oncancel}>İptal</button>
          <button class="primary" disabled={!valid} onclick={() => current && onapply(current)}>Uygula</button>
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .crop-frame {
    position: relative;
    touch-action: none;
    cursor: crosshair;
    line-height: 0;
    overflow: hidden;
    border: 3px solid;
    border-color: #080a12 var(--panel-line) var(--panel-line) #080a12;
    border-radius: 3px;
    background: #000;
  }
  .crop-frame img { width: 100%; height: auto; display: block; user-select: none; }
  .crop-box {
    position: absolute;
    border: 2px solid var(--gold);
    background: rgba(234, 200, 110, 0.18);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
    pointer-events: none;
  }
</style>
