import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bhavan.app',
  appName: 'Bhavan',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
};

export default config;
