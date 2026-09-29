<script lang="ts">
  import BuildingsView from './components/BuildingsView.svelte';
  import ScanFlow from './components/ScanFlow.svelte';
  import SettingsView from './components/SettingsView.svelte';
  import Tabs from './components/Tabs.svelte';
  import TotalView from './components/TotalView.svelte';
  import { store } from './lib/state.svelte';
  import type { Tab } from './lib/types';

  let tab = $state<Tab>('buildings');
  let scanFile = $state<File | null>(null);
</script>

<div class="container shell">
  <header><h1>GK2 Companion</h1></header>
  <Tabs bind:tab />
  <main>
    {#if store.corrupt}
      <div class="notice warn">
        Kayıtlı veri okunamadı, boş listeyle başlandı. Eski veri tarayıcıda yedeklendi.
        <button onclick={() => store.dismissCorrupt()}>Tamam</button>
      </div>
    {/if}
    {#if store.saveFailed}
      <div class="notice error">Veri kaydedilemedi (depolama dolu veya kapalı). Değişiklikler kaybolabilir.</div>
    {/if}

    {#if tab === 'buildings'}
      <BuildingsView onscan={(file) => (scanFile = file)} />
    {:else if tab === 'total'}
      <TotalView />
    {:else}
      <SettingsView />
    {/if}
  </main>
</div>

{#if scanFile}
  <ScanFlow
    file={scanFile}
    onclose={() => (scanFile = null)}
    onopensettings={() => {
      scanFile = null;
      tab = 'settings';
    }}
  />
{/if}
