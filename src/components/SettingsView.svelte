<script lang="ts">
  import { store } from '../lib/state.svelte';
  import { parseImport } from '../lib/storage';
  import MaterialRow from './MaterialRow.svelte';

  let showKey = $state(false);
  const materials = $derived([...store.state.materials].sort((a, b) => a.name.localeCompare(b.name, 'tr')));
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);

  function exportFile() {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gk2-companion-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const parsed = parseImport(await file.text());
      if (!confirm('Mevcut liste, içe aktarılan dosyayla değiştirilecek. Devam edilsin mi?')) return;
      store.replaceState(parsed);
      message = { kind: 'ok', text: 'Veriler içe aktarıldı.' };
    } catch (err) {
      message = { kind: 'error', text: err instanceof Error ? err.message : 'İçe aktarılamadı.' };
    }
  }
</script>

<section class="window">
  <header class="titlebar"><h2>Yapay zeka</h2></header>
  <div class="window-body">
    <div class="panel-row">
      <div class="field">
        <label for="apikey">DeepSeek API anahtarı</label>
        <div class="row">
          <input
            id="apikey"
            type={showKey ? 'text' : 'password'}
            autocomplete="off"
            spellcheck="false"
            value={store.settings.apiKey}
            oninput={(e) => store.setSettings({ apiKey: e.currentTarget.value })}
          />
          <button onclick={() => (showKey = !showKey)}>{showKey ? 'Gizle' : 'Göster'}</button>
        </div>
        <p class="muted">Anahtar yalnızca bu cihazda saklanır ve sadece api.deepseek.com'a gönderilir.</p>
      </div>
      <div class="field">
        <label for="model">Model adı</label>
        <input
          id="model"
          type="text"
          autocomplete="off"
          spellcheck="false"
          value={store.settings.model}
          oninput={(e) => store.setSettings({ model: e.currentTarget.value })}
        />
      </div>
    </div>
  </div>
</section>

<section class="window">
  <header class="titlebar"><h2>Tüm Eşyalar</h2></header>
  <div class="window-body">
    {#if materials.length === 0}
      <p class="muted center">Henüz eşya yok. Yapı ekleyince burada listelenir.</p>
    {:else}
      <p class="muted">Adları değiştirebilir, PNG, WEBP veya JPG görsel yükleyebilirsin.</p>
      <ul class="materials">
        {#each materials as m (m.id)}
          <MaterialRow material={m} />
        {/each}
      </ul>
    {/if}
  </div>
</section>

<section class="window">
  <header class="titlebar"><h2>Veriler</h2></header>
  <div class="window-body">
    <div class="panel-row">
      <p class="muted">Yedek dosyası yapıları ve malzemeleri içerir; API anahtarını içermez.</p>
      <div class="row wrap">
        <button onclick={exportFile}>Dışa aktar (JSON)</button>
        <label class="import">
          <span class="btn">İçe aktar (JSON)</span>
          <input type="file" accept="application/json,.json" hidden onchange={importFile} />
        </label>
      </div>
      {#if message}<p class={['notice', message.kind]}>{message.text}</p>{/if}
    </div>
  </div>
</section>

<style>
  .materials { display: grid; gap: 8px; }
  .import { cursor: pointer; }
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
  .import:hover .btn { filter: brightness(1.18); }
</style>
