<script lang="ts">
  import { aggregate } from '../lib/aggregate';
  import { store } from '../lib/state.svelte';

  const totals = $derived(aggregate(store.state));
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
            <div class="grow">
              <details>
                <summary>
                  {#if t.material.icon}<img class="slot-icon" src={t.material.icon} alt="" />{/if}
                  <span class="name name-gold">{t.material.name}</span>
                  <span class="slot big"><span class="slot-count">{t.total}</span></span>
                </summary>
                <ul class="sources">
                  {#each t.sources as s (s.buildingId)}
                    <li class="muted">{s.area} · {s.buildingName}: {s.amount}</li>
                  {/each}
                </ul>
              </details>
              <ul class="areas">
                {#each t.byArea as a (a.area)}
                  <li>{a.area} = {a.amount}</li>
                {/each}
              </ul>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .rows { display: grid; gap: 8px; }
  .grow { flex: 1; min-width: 0; }
  summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    cursor: pointer;
  }
  summary .name { flex: 1; }
  .sources { padding: 4px 0 4px 12px; display: grid; gap: 2px; }
</style>
