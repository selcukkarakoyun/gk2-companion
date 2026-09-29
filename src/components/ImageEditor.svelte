<script lang="ts">
  import { drawCrop, renderToDataUrl } from '../lib/image';
  import {
    MAX_ZOOM,
    initialView,
    panBy,
    rotate,
    rotatedSize,
    zoomAt,
    type Rotation,
    type View,
  } from '../lib/image-math';

  let {
    bitmap,
    oncancel,
    oncontinue,
  }: { bitmap: ImageBitmap; oncancel: () => void; oncontinue: (dataUrl: string) => void } = $props();

  const PREVIEW_W = 1000;

  let rot = $state<Rotation>(0);
  const size = $derived(rotatedSize(bitmap.width, bitmap.height, rot));
  let view = $state<View>({ zoom: 1, cx: 0, cy: 0 });
  let canvas = $state<HTMLCanvasElement>();
  let error = $state<string | null>(null);

  function resetView() {
    view = initialView(size.w, size.h);
  }
  resetView();

  function turn(dir: 1 | -1) {
    rot = rotate(rot, dir);
    resetView();
  }

  $effect(() => {
    if (!canvas) return;
    const w = PREVIEW_W;
    const h = Math.max(1, Math.round((PREVIEW_W * size.h) / size.w));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) drawCrop(ctx, bitmap, rot, view, w, h);
  });

  const pointers = new Map<number, { x: number; y: number }>();
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  function onpointerdown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  function onpointermove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = [...pointers.values()];
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = [...pointers.values()];
    if (before.length === 1) {
      view = panBy(view, (e.clientX - prev.x) / rect.width, (e.clientY - prev.y) / rect.height, size.w, size.h);
    } else if (before.length === 2) {
      const d0 = dist(before[0], before[1]);
      const d1 = dist(after[0], after[1]);
      const mx = (after[0].x + after[1].x) / 2;
      const my = (after[0].y + after[1].y) / 2;
      if (d0 > 0) {
        view = zoomAt(view, (view.zoom * d1) / d0, (mx - rect.left) / rect.width, (my - rect.top) / rect.height, size.w, size.h);
      }
    }
  }
  function onpointerup(e: PointerEvent) {
    pointers.delete(e.pointerId);
  }
  function onwheel(e: WheelEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    view = zoomAt(view, view.zoom * factor, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, size.w, size.h);
  }

  function proceed() {
    error = null;
    try {
      oncontinue(renderToDataUrl(bitmap, rot, view));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Görsel hazırlanamadı.';
    }
  }
</script>

<section class="window editor">
  <header class="titlebar"><h2>Görseli düzenle</h2></header>
  <div class="window-body">
  <p class="muted">İki parmakla yakınlaştır, sürükleyerek kaydır. Sadece menü satırlarını kadraja al.</p>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="frame"
    data-testid="frame"
    style:--ar={size.w / size.h}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    {onwheel}
  >
    <canvas bind:this={canvas}></canvas>
  </div>

  <div class="tools">
    <div class="row wrap">
      <button onclick={() => turn(-1)}>Sola döndür</button>
      <button onclick={() => turn(1)}>Sağa döndür</button>
      <button onclick={resetView}>Sıfırla</button>
    </div>
    <div class="field">
      <label for="zoom">Yakınlaştırma</label>
      <input
        id="zoom"
        type="range"
        min="1"
        max={MAX_ZOOM}
        step="0.05"
        value={view.zoom}
        oninput={(e) => (view = zoomAt(view, Number(e.currentTarget.value), 0.5, 0.5, size.w, size.h))}
      />
    </div>
  </div>

  {#if error}<p class="notice error">{error}</p>{/if}

  <div class="row between">
    <button onclick={oncancel}>İptal</button>
    <button class="primary" onclick={proceed}>Devam</button>
  </div>
  </div>
</section>

<style>
  .frame {
    touch-action: none;
    width: min(100%, calc(60dvh * var(--ar)));
    aspect-ratio: var(--ar);
    margin: 0 auto;
    background: #000;
    border: 3px solid;
    border-color: #080a12 var(--panel-line) var(--panel-line) #080a12;
    border-radius: 3px;
    overflow: hidden;
    cursor: grab;
  }
  canvas { display: block; width: 100%; height: 100%; }
  .tools { display: grid; gap: 10px; }
</style>
