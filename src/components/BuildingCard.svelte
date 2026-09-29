<script lang="ts">
  import { store } from '../lib/state.svelte';
  import type { Building } from '../lib/types';

  let { building }: { building: Building } = $props();

  const nameOf = (id: string) => store.state.materials.find((m) => m.id === id)?.name ?? '?';

  function remove() {
    if (confirm(`"${building.name}" silinsin mi?`)) store.deleteBuilding(building.id);
  }
</script>

<article class={['card', 'building', { done: building.built }]}>
  <header class="row between">
    <h3>{building.name}</h3>
    <button class="danger" onclick={remove}>Sil</button>
  </header>
  <ul class="chips">
    {#each building.requirements as r (r.materialId)}
      <li class="chip">
        {nameOf(r.materialId)} ×{r.amount}{building.qty > 1 ? ` (${r.amount * building.qty})` : ''}
      </li>
    {/each}
  </ul>
  <footer class="row between wrap">
    <div class="stepper">
      <button
        class="icon"
        aria-label="Adedi azalt"
        disabled={building.qty <= 1}
        onclick={() => store.setQty(building.id, building.qty - 1)}>−</button
      >
      <output aria-label="Adet">{building.qty}</output>
      <button class="icon" aria-label="Adedi artır" onclick={() => store.setQty(building.id, building.qty + 1)}>+</button>
    </div>
    <label class="check">
      <input type="checkbox" checked={building.built} onchange={() => store.toggleBuilt(building.id)} />
      Yapıldı
    </label>
  </footer>
</article>

<style>
  .done { opacity: 0.55; }
</style>
