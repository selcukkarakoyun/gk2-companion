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
    gap: 4px;
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    background: linear-gradient(180deg, var(--frame), var(--frame-lo));
    border-top: 3px solid var(--frame-hi);
    box-shadow: 0 -3px 0 var(--frame-dark), 0 -8px 24px rgba(0, 0, 0, 0.5);
  }
  nav button {
    flex: 1;
    min-height: 52px;
    font-size: 1.05rem;
    color: var(--muted);
    background: linear-gradient(180deg, #232a40, #1a2033);
    border-color: #0b0d14 var(--frame) var(--frame) #0b0d14;
  }
  nav button.active {
    color: var(--parch-ink);
    background: linear-gradient(180deg, var(--parch-hi), var(--parch) 45%, var(--parch-lo));
    border-color: #efd39a #5c4019 #3e2a0f #c99f5d;
    text-shadow: 0 1px 0 rgba(255, 236, 190, 0.5);
  }
  @media (min-width: 720px) {
    nav {
      position: static;
      padding: 6px;
      border: 4px solid;
      border-color: var(--frame-hi) var(--frame) var(--frame-lo) var(--frame);
      border-radius: 6px;
      box-shadow: 0 0 0 2px var(--frame-dark);
    }
    nav button { min-height: 46px; }
  }
</style>
