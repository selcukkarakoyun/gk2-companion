<script lang="ts">
  import { groupByArea } from '../lib/areas';
  import { store } from '../lib/state.svelte';
  import BuildingCard from './BuildingCard.svelte';
  import ScanButton from './ScanButton.svelte';

  let { onscan }: { onscan: (file: File) => void } = $props();

  const groups = $derived(groupByArea(store.state.buildings));
</script>

<section class="window">
  <header class="titlebar">
    <h2>Yapılar</h2>
  </header>
  <div class="window-body">
    <div class="panel-row">
      <h3 class="name-gold">İnşa menüsünü tara</h3>
      <ScanButton disabled={!store.online} onfile={onscan} />
      {#if !store.online}
        <p class="muted">Çevrimdışısın, tarama için internet gerekir.</p>
      {/if}
    </div>

    {#if store.state.buildings.length === 0}
      <p class="muted center">Henüz yapı yok. İnşa menüsünün ekran görüntüsünü veya fotoğrafını tara.</p>
    {/if}

    {#each groups as group (group.area)}
      <h2 class="divider">{group.area}</h2>
      {#each group.buildings as building (building.id)}
        <BuildingCard {building} />
      {/each}
    {/each}
  </div>
</section>
