import type { PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();
export const getNativePlatform = (): string => Capacitor.getPlatform();

export const listenForAppUrls = async (
  onOpenUrl: (url: string) => void
): Promise<PluginListenerHandle | null> => {
  if (!isNativeApp()) return null;
  const { App } = await import('@capacitor/app');
  return App.addListener('appUrlOpen', ({ url }) => {
    if (url) onOpenUrl(url);
  });
};
