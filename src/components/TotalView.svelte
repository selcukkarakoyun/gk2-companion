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

{#if totals.length === 0}
  <p class="muted center">Toplanacak malzeme yok. Yapılmamış yapı ekleyince burada görünür.</p>
{:else}
  <ul class="card">
    {#each totals as t (t.material.id)}
      <li data-testid="total-row" class="total-row">
        {#if editingId === t.material.id}
          <div class="field">
            <div class="row">
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
                <span class="name">{t.material.name}</span>
                <strong class="total">{t.total}</strong>
              </summary>
              <ul class="sources">
                {#each t.sources as s (s.buildingId)}
                  <li class="muted">{s.buildingName}: {s.amount}</li>
                {/each}
              </ul>
            </details>
            <button
              class="icon"
              aria-label="{t.material.name} adını düzenle"
              onclick={() => startEdit(t.material.id, t.material.name)}>Düzenle</button
            >
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .total-row { padding: 6px 0; border-bottom: 1px solid var(--line); }
  .total-row:last-child { border-bottom: 0; }
  details { flex: 1; min-width: 0; }
  summary { display: flex; justify-content: space-between; gap: 12px; cursor: pointer; min-height: 44px; align-items: center; }
  .total { font-size: 1.2rem; color: var(--accent); }
  .sources { padding: 0 0 8px 12px; display: grid; gap: 2px; }
</style>
