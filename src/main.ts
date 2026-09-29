import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/jersey-10/latin-400.css';
import '@fontsource/jersey-10/latin-ext-400.css';
import './app.css';
import App from './App.svelte';
import { store } from './lib/state.svelte';

store.init();
mount(App, { target: document.getElementById('app')! });
registerSW({ immediate: true });
