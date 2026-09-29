<script lang="ts">
  import type { Tab } from '../lib/types';

  let { tab = $bindable() }: { tab: Tab } = $props();

  const items: { id: Tab; label: string }[] = [
    { id: 'buildings', label: 'Yapılar' },
    { id: 'total', label: 'Toplam' },
    { id: 'settings', label: 'Ayarlar' },
  ];
</script>

<nav aria-label="Ana menü">
  {#each items as item (item.id)}
    <button
      class={{ active: tab === item.id }}
      aria-current={tab === item.id ? 'page' : undefined}
      onclick={() => (tab = item.id)}
    >
      {item.label}
    </button>
  {/each}
</nav>

<style>
  nav {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 10;
    display: flex;
    background: var(--panel);
    border-top: 1px solid var(--line);
    padding-bottom: env(safe-area-inset-bottom);
  }
  nav button {
    flex: 1;
    min-height: 56px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--muted);
  }
  nav button.active {
    color: var(--accent);
    box-shadow: inset 0 3px 0 var(--accent);
  }
  @media (min-width: 720px) {
    nav {
      position: static;
      border: 0;
      border-bottom: 1px solid var(--line);
      background: transparent;
      padding-bottom: 0;
    }
    nav button { min-height: 48px; }
    nav button.active { box-shadow: inset 0 -3px 0 var(--accent); }
  }
</style>
