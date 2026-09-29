<script lang="ts">
  import { store } from '../lib/state.svelte';
  import type { Building } from '../lib/types';
  import BlueprintIcon from './BlueprintIcon.svelte';

  let { building }: { building: Building } = $props();

  const materialOf = (id: string) => store.state.materials.find((m) => m.id === id);

  function remove() {
    if (confirm(`"${building.name}" silinsin mi?`)) store.deleteBuilding(building.id);
  }
</script>

<article class={['panel-row', 'building', { done: building.built }]}>
  <header class="row">
    <BlueprintIcon />
    <h3 class={['grow', building.built ? 'name-dim' : 'name-gold']}>{building.name}</h3>
    <div class="stepper header-stepper">
      <button
        class="icon"
        aria-label="Adedi azalt"
        disabled={building.qty <= 1}
        onclick={() => store.setQty(building.id, building.qty - 1)}>−</button
      >
      <output aria-label="Adet">{building.qty}</output>
      <button class="icon" aria-label="Adedi artır" onclick={() => store.setQty(building.id, building.qty + 1)}>+</button>
    </div>
    <button class="danger" onclick={remove}>Sil</button>
  </header>
  <div class="body">
    <ul class="slots">
      {#each building.requirements as r (r.materialId)}
        {@const m = materialOf(r.materialId)}
        <li class="slot">
          {#if m?.icon}<img class="slot-icon" src={m.icon} alt="" />{/if}
          <span class="slot-name">{m?.name ?? '?'}</span>
          <span class="slot-count">
            ×{r.amount}{#if building.qty > 1}<small>= {r.amount * building.qty}</small>{/if}
          </span>
        </li>
      {/each}
    </ul>
    <label class="check">
      <input type="checkbox" checked={building.built} onchange={() => store.toggleBuilt(building.id)} />
      Yapıldı
    </label>
  </div>
</article>

<style>
  .grow { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .header-stepper { margin-inline-end: 24px; }
  .body { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 10px; }
  .body .slots { flex: 1; min-width: 0; }
</style>
