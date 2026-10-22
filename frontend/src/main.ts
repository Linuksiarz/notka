import { mount } from 'svelte';
import App from './boundary/App.svelte';
import { followSystemTextSize } from './boundary/textScale';
import './boundary/styles/global.css';
/*
 * Keep's two faces, both shipped rather than linked from Google's CDN: this is a self-hosted,
 * offline-installable app, so every instance would otherwise talk to Google on every load — and the
 * project is meant to have nothing to do with Google. Google Sans is on Google Fonts under the SIL
 * Open Font License, which is what makes bundling it legitimate; Roboto (Apache-2.0) is the fallback
 * the original names behind it. `latin-ext` carries the Polish diacritics in both.
 */
import '@fontsource/google-sans/latin-400.css';
import '@fontsource/google-sans/latin-ext-400.css';
import '@fontsource/google-sans/latin-500.css';
import '@fontsource/google-sans/latin-ext-500.css';
import '@fontsource/google-sans/latin-700.css';
import '@fontsource/google-sans/latin-ext-700.css';
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-ext-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-ext-500.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/roboto/latin-ext-700.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app mount point is missing from index.html');

followSystemTextSize();
const app = mount(App, { target });

// The development server does not need a service worker, and a stale cache there is confusing.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}

export default app;
