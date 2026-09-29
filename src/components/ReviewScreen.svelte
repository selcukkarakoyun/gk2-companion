<script lang="ts">
  import { newMaterialForRow, normalizeName, validateDraft } from '../lib/merge';
  import type { AppState, ReviewBuilding, ReviewDraft, ReviewNewMaterial, ReviewRequirement } from '../lib/types';

  let {
    draft = $bindable(),
    appState,
    onconfirm,
    oncancel,
  }: { draft: ReviewDraft; appState: AppState; onconfirm: () => void; oncancel: () => void } = $props();

  const error = $derived(validateDraft(draft, appState));

  const usedNewKeys = $derived(
    new Set(
      draft.buildings
        .filter((b) => b.include)
        .flatMap((b) => b.requirements.map((r) => r.newKey))
        .filter((k): k is string => k !== null),
    ),
  );
  const visibleNew = $derived(draft.newMaterials.filter((nm) => usedNewKeys.has(nm.key)));

  const buildingExists = (name: string) => {
    const n = normalizeName(name);
    return n !== '' && appState.buildings.some((b) => normalizeName(b.name) === n);
  };
  const newLabel = (nm: ReviewNewMaterial) => nm.name.trim() || '(adsız yeni malzeme)';
  const rowValue = (r: ReviewRequirement) => (r.materialId ? `m:${r.materialId}` : `n:${r.newKey}`);

  function setRowMaterial(r: ReviewRequirement, value: string) {
    if (value === 'new') {
      newMaterialForRow(draft, r.key);
    } else if (value.startsWith('m:')) {
      r.materialId = value.slice(2);
      r.newKey = null;
    } else {
      r.materialId = null;
      r.newKey = value.slice(2);
    }
  }
  function removeRow(b: ReviewBuilding, r: ReviewRequirement) {
    b.requirements = b.requirements.filter((x) => x.key !== r.key);
  }
</script>

<section class="window review">
  <header class="titlebar"><h2>Sonucu kontrol et</h2></header>
  <div class="window-body">
  <p class="muted">
    Küçük pikselli rakamlarda hata olabilir. Adları ve miktarları düzelt, gerekmeyen satırları çıkar.
  </p>

  {#if visibleNew.length > 0}
    <div class="panel-row">
      <h3 class="name-gold">Yeni malzemeler</h3>
      <p class="muted">AI ikon adı bilmez, kendi önerisini yazdı. Adı değiştirebilir veya mevcut bir malzemeyle eşleştirebilirsin.</p>
      {#each visibleNew as nm (nm.key)}
        <div class="field new-material" data-testid="review-new-material">
          <div class="row wrap">
            <input type="text" aria-label="Yeni malzeme adı" bind:value={nm.name} disabled={nm.mapTo !== null} />
            <select
              aria-label="{newLabel(nm)} için mevcut malzeme"
              value={nm.mapTo ?? ''}
              onchange={(e) => (nm.mapTo = e.currentTarget.value || null)}
            >
              <option value="">Yeni malzeme</option>
              {#each appState.materials as m (m.id)}
                <option value={m.id}>Eşleştir: {m.name}</option>
              {/each}
            </select>
          </div>
          {#if nm.description}<p class="muted">İkon tarifi: {nm.description}</p>{/if}
        </div>
      {/each}
    </div>
  {/if}

  {#each draft.buildings as b (b.key)}
    <div class={['panel-row', { excluded: !b.include }]} data-testid="review-building">
      <div class="row wrap">
        <label class="check">
          <input type="checkbox" bind:checked={b.include} aria-label="Yapıyı ekle" />
        </label>
        <input type="text" aria-label="Yapı adı" bind:value={b.name} />
        {#if buildingExists(b.name)}
          <span class="badge update">Mevcut kayıt güncellenecek</span>
        {:else}
          <span class="badge new">Yeni</span>
        {/if}
      </div>
      {#if b.include}
        {#each b.requirements as r (r.key)}
          <div class="row wrap req">
            <select aria-label="Malzeme" value={rowValue(r)} onchange={(e) => setRowMaterial(r, e.currentTarget.value)}>
              <optgroup label="Mevcut malzemeler">
                {#each appState.materials as m (m.id)}
                  <option value={`m:${m.id}`}>{m.name}</option>
                {/each}
              </optgroup>
              {#if visibleNew.length > 0}
                <optgroup label="Yeni malzemeler">
                  {#each visibleNew as nm (nm.key)}
                    <option value={`n:${nm.key}`}>{newLabel(nm)}</option>
                  {/each}
                </optgroup>
              {/if}
              <option value="new">+ Yeni malzeme</option>
            </select>
            <input class="amount" type="number" min="1" step="1" aria-label="Miktar" bind:value={r.amount} />
            <button class="danger" aria-label="Satırı sil" onclick={() => removeRow(b, r)}>Sil</button>
          </div>
        {/each}
      {/if}
    </div>
  {/each}

  {#if error}<p class="notice error" role="alert">{error}</p>{/if}

  <div class="row between actions">
    <button onclick={oncancel}>İptal</button>
    <button class="primary" disabled={error !== null} onclick={onconfirm}>Listeye ekle</button>
  </div>
  </div>
</section>

<style>
  .excluded { opacity: 0.55; }
  .row > input[type='text'] { flex: 1; min-width: 10ch; }
  .row > select { flex: 1; min-width: 10ch; }
  .amount { width: 6rem !important; flex: 0 0 auto; }
  .req { padding-left: 4px; }
  .actions {
    position: sticky;
    bottom: 0;
    margin: 0 -10px -10px;
    padding: 10px;
    background: var(--panel);
    border-top: 2px solid var(--panel-line);
  }
</style>
