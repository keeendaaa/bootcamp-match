import { WebPlugin, registerPlugin } from '@capacitor/core';

export interface DeviceNowPlayingTrack {
  title: string;
  artist?: string;
  album?: string;
  durationMs?: number;
  sourceApp?: string;
  packageName?: string;
  coverDataUrl?: string;
}

export interface DeviceNowPlayingSnapshot {
  supported: boolean;
  platform: string;
  accessGranted: boolean;
  track: DeviceNowPlayingTrack | null;
}

interface NowPlayingDetectorPlugin {
  getStatus(): Promise<DeviceNowPlayingSnapshot>;
  getCurrentTrack(): Promise<DeviceNowPlayingSnapshot>;
  openAccessSettings(): Promise<void>;
}

class NowPlayingDetectorWeb extends WebPlugin implements NowPlayingDetectorPlugin {
  async getStatus(): Promise<DeviceNowPlayingSnapshot> {
    return {
      supported: false,
      platform: 'web',
      accessGranted: false,
      track: null,
    };
  }

  async getCurrentTrack(): Promise<DeviceNowPlayingSnapshot> {
    return this.getStatus();
  }

  async openAccessSettings(): Promise<void> {
    return;
  }
}

export const NowPlayingDetector = registerPlugin<NowPlayingDetectorPlugin>('NowPlayingDetector', {
  web: async () => new NowPlayingDetectorWeb(),
});
