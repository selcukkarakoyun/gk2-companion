<script lang="ts">
  import { onMount } from 'svelte';
  import { createDeepSeekProvider } from '../lib/ai/deepseek';
  import { ScanError } from '../lib/ai/provider';
  import { loadImage } from '../lib/image';
  import { scanToDraft } from '../lib/merge';
  import { store } from '../lib/state.svelte';
  import { DEFAULT_MODEL } from '../lib/storage';
  import type { ReviewDraft } from '../lib/types';
  import ImageEditor from './ImageEditor.svelte';
  import ReviewScreen from './ReviewScreen.svelte';

  let { file, onclose, onopensettings }: { file: File; onclose: () => void; onopensettings: () => void } = $props();

  type Step =
    | { kind: 'loading' }
    | { kind: 'edit' }
    | { kind: 'scanning' }
    | { kind: 'empty' }
    | { kind: 'error'; message: string; code: string | null }
    | { kind: 'review' };

  let step = $state<Step>({ kind: 'loading' });
  let draft = $state<ReviewDraft>({ buildings: [], newMaterials: [] });
  let bitmap = $state.raw<ImageBitmap | null>(null);
  let imageDataUrl = $state('');
  let controller: AbortController | null = null;

  onMount(() => {
    loadImage(file)
      .then((b) => {
        bitmap = b;
        step = { kind: 'edit' };
      })
      .catch((err: unknown) => {
        step = { kind: 'error', message: err instanceof Error ? err.message : 'Görsel açılamadı.', code: null };
      });
    return () => {
      controller?.abort();
      bitmap?.close();
    };
  });

  async function runScan() {
    if (!store.settings.apiKey.trim()) {
      step = { kind: 'error', message: 'Ayarlardan API anahtarı gir.', code: 'no-key' };
      return;
    }
    step = { kind: 'scanning' };
    controller = new AbortController();
    try {
      const provider = createDeepSeekProvider({
        apiKey: store.settings.apiKey,
        model: store.settings.model.trim() || DEFAULT_MODEL,
      });
      const result = await provider.scan({
        imageDataUrl,
        knownMaterials: $state.snapshot(store.state.materials),
        signal: controller.signal,
      });
      if (result.buildings.length === 0) {
        step = { kind: 'empty' };
        return;
      }
      draft = scanToDraft(result, $state.snapshot(store.state));
      step = { kind: 'review' };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      step = {
        kind: 'error',
        message: e instanceof ScanError ? e.message : 'Beklenmeyen bir hata oluştu.',
        code: e instanceof ScanError ? e.code : null,
      };
    }
  }

  function onContinue(dataUrl: string) {
    imageDataUrl = dataUrl;
    void runScan();
  }

  function cancelScanning() {
    controller?.abort();
    onclose();
  }

  function confirmDraft() {
    store.applyScan($state.snapshot(draft));
    onclose();
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Tarama">
  <div class="overlay-inner">
    {#if step.kind === 'loading'}
      <p class="center">Görsel açılıyor…</p>
    {:else if step.kind === 'edit' && bitmap}
      <ImageEditor {bitmap} oncancel={onclose} oncontinue={onContinue} />
    {:else if step.kind === 'scanning'}
      <div class="center" role="status">
        <div class="spinner"></div>
        <p>Yapay zeka görseli okuyor…</p>
      </div>
      <button onclick={cancelScanning}>Vazgeç</button>
    {:else if step.kind === 'empty'}
      <p class="notice">Yapı bulunamadı, daha net çek.</p>
      <div class="row wrap">
        <button class="primary" onclick={() => (step = { kind: 'edit' })}>Görseli düzenle</button>
        <button onclick={onclose}>Kapat</button>
      </div>
    {:else if step.kind === 'error'}
      <p class="notice error" role="alert">{step.message}</p>
      <div class="row wrap">
        {#if step.code === 'no-key' || step.code === 'auth'}
          <button class="primary" onclick={onopensettings}>Ayarlara git</button>
        {:else if imageDataUrl}
          <button class="primary" onclick={runScan}>Tekrar dene</button>
        {/if}
        {#if bitmap}<button onclick={() => (step = { kind: 'edit' })}>Görseli düzenle</button>{/if}
        <button onclick={onclose}>Kapat</button>
      </div>
    {:else if step.kind === 'review'}
      <ReviewScreen bind:draft appState={store.state} onconfirm={confirmDraft} oncancel={onclose} />
    {/if}
  </div>
</div>
