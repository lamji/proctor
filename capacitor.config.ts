import type { CapacitorConfig } from '@capacitor/cli';

const defaultServerUrl = 'https://proctor-phi.vercel.app';
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || defaultServerUrl;

const config: CapacitorConfig = {
  appId: 'com.lamji.proctor',
  appName: 'Proctor Capture',
  webDir: 'public',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
