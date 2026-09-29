<script lang="ts">
  import { fileToIcon } from '../lib/image';
  import { store } from '../lib/state.svelte';
  import type { Material } from '../lib/types';

  let { material }: { material: Material } = $props();

  let draft = $state('');
  let error = $state<string | null>(null);

  $effect(() => {
    draft = material.name;
  });

  function commit() {
    if (draft.trim().replace(/\s+/g, ' ') === material.name) {
      draft = material.name;
      error = null;
      return;
    }
    const err = store.renameMaterial(material.id, draft);
    if (err) error = err;
    else error = null;
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') e.currentTarget instanceof HTMLInputElement && e.currentTarget.blur();
    else if (e.key === 'Escape') {
      draft = material.name;
      error = null;
    }
  }

  async function upload(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      store.setMaterialIcon(material.id, await fileToIcon(file));
      error = null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Görsel yüklenemedi.';
    }
  }
</script>

<li class="panel-row" data-testid="material-row">
  <div class="row wrap">
    <span class="preview">
      {#if material.icon}<img class="slot-icon big" src={material.icon} alt="{material.name} ikonu" />{/if}
    </span>
    <input
      type="text"
      class="name-input"
      aria-label="{material.name} adı"
      bind:value={draft}
      onblur={commit}
      {onkeydown}
    />
    <label class="upload">
      <span class="btn">Görsel yükle</span>
      <input
        type="file"
        accept="image/png,image/webp,image/jpeg"
        aria-label="{material.name} için görsel yükle"
        hidden
        onchange={upload}
      />
    </label>
    {#if material.icon}
      <button aria-label="{material.name} görselini kaldır" onclick={() => store.setMaterialIcon(material.id, null)}>Kaldır</button>
    {/if}
  </div>
  {#if error}<p class="notice error" role="alert">{error}</p>{/if}
</li>

<style>
  .preview {
    flex: none;
    width: 60px;
    height: 60px;
    display: grid;
    place-items: center;
    background: var(--slot);
    border: 2px solid;
    border-color: #080a12 var(--panel-line) var(--panel-line) #080a12;
    border-radius: 3px;
  }
  .name-input { flex: 1; min-width: 10ch; }
  .upload { cursor: pointer; }
  .btn {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0.45rem 0.95rem;
    font-weight: 400;
    color: var(--cream);
    text-shadow: 0 2px 0 rgba(0, 0, 0, 0.6);
    background: linear-gradient(180deg, #3b4360, #2a3148);
    border: 2px solid;
    border-color: var(--frame-hi) var(--frame-lo) var(--frame-dark) var(--frame);
    border-radius: 4px;
  }
  .upload:hover .btn { filter: brightness(1.18); }
</style>
