<script lang="ts">
  import { listAreas } from '../lib/areas';
  import { findBuilding, newMaterialForRow, usedMaterialIds, validateDraft } from '../lib/merge';
  import type {
    AppState,
    Box,
    ReviewBuilding,
    ReviewDraft,
    ReviewNewMaterial,
    ReviewRequirement,
  } from '../lib/types';
  import IconCropper from './IconCropper.svelte';

  let {
    draft = $bindable(),
    appState,
    image,
    crop,
    onconfirm,
    oncancel,
  }: {
    draft: ReviewDraft;
    appState: AppState;
    image: string | null;
    crop: ((box: Box) => string) | null;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  const error = $derived(validateDraft(draft, appState));
  const areas = $derived(listAreas(appState));

  const usedNewKeys = $derived(
    new Set(
      draft.buildings
        .filter((b) => b.include)
        .flatMap((b) => b.requirements.map((r) => r.newKey))
        .filter((k): k is string => k !== null),
    ),
  );
  const visibleNew = $derived(draft.newMaterials.filter((nm) => usedNewKeys.has(nm.key)));

  const buildingExists = (name: string) =>
    name.trim() !== '' && findBuilding(appState.buildings, draft.area, name) !== undefined;
  const usedIds = $derived(usedMaterialIds(draft));
  const visibleFills = $derived(draft.iconFills.filter((f) => usedIds.has(f.materialId)));
  const newLabel = (nm: ReviewNewMaterial) => nm.name.trim() || '(adsız yeni malzeme)';
  const rowValue = (r: ReviewRequirement) => (r.materialId ? `m:${r.materialId}` : `n:${r.newKey}`);
  const materialName = (id: string) => appState.materials.find((m) => m.id === id)?.name ?? '?';

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

  type CropTarget = { kind: 'new'; key: string } | { kind: 'fill'; materialId: string };
  let cropTarget = $state<CropTarget | null>(null);
  let cropError = $state<string | null>(null);

  const targetBox = $derived.by((): Box | null => {
    const t = cropTarget;
    if (!t) return null;
    if (t.kind === 'new') return draft.newMaterials.find((n) => n.key === t.key)?.box ?? null;
    return draft.iconFills.find((f) => f.materialId === t.materialId)?.box ?? null;
  });

  function applyCrop(box: Box) {
    const t = cropTarget;
    cropTarget = null;
    if (!t || !crop) return;
    let icon: string;
    try {
      icon = crop(box);
    } catch {
      cropError = 'Kırpma yapılamadı.';
      return;
    }
    cropError = null;
    if (t.kind === 'new') {
      const nm = draft.newMaterials.find((n) => n.key === t.key);
      if (nm) {
        nm.box = box;
        nm.icon = icon;
      }
    } else {
      const f = draft.iconFills.find((x) => x.materialId === t.materialId);
      if (f) {
        f.box = box;
        f.icon = icon;
        f.accept = true;
      }
    }
  }
</script>

<section class="window review">
  <header class="titlebar"><h2>Sonucu kontrol et</h2></header>
  <div class="window-body">
    <p class="muted">
      Küçük pikselli rakamlarda hata olabilir. Adları ve miktarları düzelt, gerekmeyen satırları çıkar.
    </p>

    <div class="panel-row">
      <div class="field">
        <label for="area">Alan</label>
        <input id="area" type="text" list="area-list" autocomplete="off" bind:value={draft.area} />
        <datalist id="area-list">
          {#each areas as a (a)}<option value={a}></option>{/each}
        </datalist>
      </div>
      {#if draft.skippedEmpty > 0}
        <p class="muted">{draft.skippedEmpty} malzemesiz yapı atlandı.</p>
      {/if}
    </div>

    {#if cropError}<p class="notice error" role="alert">{cropError}</p>{/if}

    {#if visibleNew.length > 0}
      <div class="panel-row">
        <h3 class="name-gold">Yeni malzemeler</h3>
        <p class="muted">AI ikon adı bilmez, kendi önerisini yazdı. Adı değiştirebilir veya mevcut bir malzemeyle eşleştirebilirsin.</p>
        {#each visibleNew as nm (nm.key)}
          <div class="field new-material" data-testid="review-new-material">
            <div class="row wrap">
              {@render iconEdit(nm.icon, `${nm.name} ikonu`, { kind: 'new', key: nm.key })}
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

    {#if visibleFills.length > 0}
      <div class="panel-row" data-testid="icon-fills">
        <h3 class="name-gold">İkon önerileri</h3>
        <p class="muted">Bu malzemelerin henüz ikonu yok. Taramadan kesilen ikonu kaydedebilirsin.</p>
        {#each visibleFills as f (f.materialId)}
          <div class="row wrap">
            {@render iconEdit(f.icon, `${materialName(f.materialId)} ikon önerisi`, { kind: 'fill', materialId: f.materialId })}
            <span class="name-gold">{materialName(f.materialId)}</span>
            <label class="check">
              <input type="checkbox" bind:checked={f.accept} disabled={!f.icon} />
              İkonu kaydet
            </label>
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

{#snippet iconEdit(icon: string | null | undefined, alt: string, target: CropTarget)}
  {#if image && crop}
    <button class="icon-edit" aria-label="İkonu düzenle" title="İkonu düzenle" onclick={() => (cropTarget = target)}>
      {#if icon}<img class="slot-icon big" src={icon} {alt} />{:else}<span class="slot-icon big"></span>{/if}
      <svg class="pencil" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M3 17.25V21h3.75L18.4 9.35l-3.75-3.75L3 17.25zM20.7 7.05a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
      </svg>
    </button>
  {:else if icon}
    <img class="slot-icon big" src={icon} {alt} />
  {/if}
{/snippet}

{#if cropTarget && image}
  <IconCropper {image} box={targetBox} onapply={applyCrop} oncancel={() => (cropTarget = null)} />
{/if}

<style>
  .excluded { opacity: 0.55; }
  .icon-edit {
    position: relative;
    flex: none;
    width: 60px;
    height: 60px;
    min-height: 0;
    padding: 0;
    display: grid;
    place-items: center;
  }
  .icon-edit .slot-icon { width: 52px; height: 52px; }
  .icon-edit .pencil {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 14px;
    box-sizing: border-box;
    color: var(--cream);
    background: rgb(0 0 0 / 0.55);
    opacity: 0;
    transition: opacity 0.12s;
    pointer-events: none;
  }
  .icon-edit:hover .pencil,
  .icon-edit:focus-visible .pencil { opacity: 1; }
  @media (hover: none) {
    .icon-edit .pencil { inset: auto 0 0 auto; width: 22px; height: 22px; padding: 3px; opacity: 1; }
  }
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
