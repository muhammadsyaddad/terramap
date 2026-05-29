import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  runner: {
    binaries: {
      chrome: process.env.CHROME_PATH || '/opt/thorium-browser-avx2/thorium',
    },
  },
  manifest: {
    name: 'TerraMap Agent',
    description: 'Chat with an AI analyst that scrapes Google Maps areas and sizes up the competition',
    permissions: ['storage', 'activeTab', 'scripting', 'tabs', 'alarms', 'sidePanel'],
    host_permissions: ['https://*.google.com/*'],
    action: { default_title: 'Open TerraMap Agent' },
    side_panel: { default_path: 'sidepanel.html' },
  },
});
