import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'Ideas Restaurant',
  webDir: 'www',
  server: {
    // While the backend is served over HTTP (no SSL yet), use http://localhost in Android WebView
    // to avoid Mixed Content errors when calling http:// APIs.
    androidScheme: 'http',
    cleartext: true
  }
};

export default config;
