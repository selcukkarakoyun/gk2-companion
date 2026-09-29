<script lang="ts">
  import { store } from '../lib/state.svelte';
  import BuildingCard from './BuildingCard.svelte';
  import ScanButton from './ScanButton.svelte';

  let { onscan }: { onscan: (file: File) => void } = $props();

  const pending = $derived(store.state.buildings.filter((b) => !b.built));
  const done = $derived(store.state.buildings.filter((b) => b.built));
</script>

<section class="card">
  <h2>İnşa menüsünü tara</h2>
  <ScanButton disabled={!store.online} onfile={onscan} />
  {#if !store.online}
    <p class="muted">Çevrimdışısın, tarama için internet gerekir.</p>
  {/if}
</section>

{#if store.state.buildings.length === 0}
  <p class="muted center">Henüz yapı yok. İnşa menüsünün ekran görüntüsünü veya fotoğrafını tara.</p>
{/if}

{#each pending as building (building.id)}
  <BuildingCard {building} />
{/each}

{#if done.length > 0}
  <h2>Yapıldı</h2>
  {#each done as building (building.id)}
    <BuildingCard {building} />
  {/each}
{/if}
