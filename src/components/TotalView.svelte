<script lang="ts">
  import { aggregate } from '../lib/aggregate';
  import { store } from '../lib/state.svelte';

  const totals = $derived(aggregate(store.state));

  let editingId = $state<string | null>(null);
  let draftName = $state('');
  let error = $state<string | null>(null);

  function startEdit(id: string, name: string) {
    editingId = id;
    draftName = name;
    error = null;
  }
  function commit() {
    if (editingId === null) return;
    const err = store.renameMaterial(editingId, draftName);
    if (err) {
      error = err;
      return;
    }
    editingId = null;
  }
  function cancel() {
    editingId = null;
    error = null;
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') cancel();
  }
</script>

<section class="window">
  <header class="titlebar">
    <h2>Toplanacak malzemeler</h2>
  </header>
  <div class="window-body">
    {#if totals.length === 0}
      <p class="muted center">Toplanacak malzeme yok. Yapılmamış yapı ekleyince burada görünür.</p>
    {:else}
      <ul class="rows">
        {#each totals as t (t.material.id)}
          <li data-testid="total-row" class="panel-row total-row">
            {#if editingId === t.material.id}
              <div class="field">
                <div class="row wrap">
                  <input type="text" bind:value={draftName} {onkeydown} aria-label="Malzeme adı" />
                  <button class="primary" onclick={commit}>Kaydet</button>
                  <button onclick={cancel}>Vazgeç</button>
                </div>
                {#if error}<p class="notice error">{error}</p>{/if}
              </div>
            {:else}
              <div class="row between">
                <details>
                  <summary>
                    <span class="name name-gold">{t.material.name}</span>
                    <span class="slot big"><span class="slot-count">{t.total}</span></span>
                  </summary>
                  <ul class="sources">
                    {#each t.sources as s (s.buildingId)}
                      <li class="muted">{s.buildingName}: {s.amount}</li>
                    {/each}
                  </ul>
                </details>
                <button
                  class="icon edit"
                  aria-label="{t.material.name} adını düzenle"
                  onclick={() => startEdit(t.material.id, t.material.name)}>Düzenle</button
                >
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .rows { display: grid; gap: 8px; }
  details { flex: 1; min-width: 0; }
  summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    cursor: pointer;
  }
  .sources { padding: 4px 0 4px 12px; display: grid; gap: 2px; }
  .edit { font-size: 0.95rem; padding: 0.35rem 0.7rem; }
</style>
