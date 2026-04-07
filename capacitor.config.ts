import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'Ideas Restaurant',
  webDir: 'www',
  server: {
    // On Android (WebView 117+), custom schemes can break routing/origin.
    // Keep the local origin as https://localhost and allow calling http:// APIs via mixed-content config in MainActivity.
    hostname: 'localhost',
    androidScheme: 'https',
    cleartext: true
  }
};

export default config;
