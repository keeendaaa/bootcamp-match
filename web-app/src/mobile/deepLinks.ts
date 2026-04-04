export const WIDGET_SOURCE = 'friends-widget';
export const MATCH_DEEP_LINK_SCHEME = 'matchapp';
export const MATCH_DEEP_LINK_HOST = 'widget';
export const MATCH_DEEP_LINK_PATH = '/open';
export const AUTH_CALLBACK_HOST = 'auth';
export const AUTH_CALLBACK_PATH = '/callback';

type SocialProvider = 'google' | 'yandex';

export interface WidgetOpenRequest {
  source: typeof WIDGET_SOURCE;
  tab: 'friends';
  friendId: number;
  trackId?: number;
  autoplay: boolean;
}

export interface AuthCallbackResult {
  provider?: SocialProvider;
  accessToken?: string;
  error?: string;
}

const TRUE_VALUES = new Set(['1', 'true', 'yes']);

const parsePositiveInt = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const isWidgetOpenUrl = (url: URL): boolean => {
  if (url.protocol === `${MATCH_DEEP_LINK_SCHEME}:`) {
    return url.host === MATCH_DEEP_LINK_HOST && url.pathname === MATCH_DEEP_LINK_PATH;
  }
  return url.searchParams.get('source') === WIDGET_SOURCE;
};

export const parseWidgetOpenRequest = (rawUrl: string): WidgetOpenRequest | null => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!isWidgetOpenUrl(url)) return null;

  const friendId = parsePositiveInt(url.searchParams.get('friendId'));
  if (!friendId) return null;

  return {
    source: WIDGET_SOURCE,
    tab: 'friends',
    friendId,
    trackId: parsePositiveInt(url.searchParams.get('trackId')),
    autoplay: TRUE_VALUES.has((url.searchParams.get('autoplay') || '').toLowerCase()),
  };
};

export const getInitialWidgetOpenRequest = (): WidgetOpenRequest | null => {
  if (typeof window === 'undefined') return null;
  return parseWidgetOpenRequest(window.location.href);
};

export const buildSocialCallbackTarget = (
  origin = typeof window === 'undefined' ? 'https://matchapp.site/' : window.location.href
): string => {
  const url = new URL(origin);
  return `${url.origin}${url.pathname}`;
};

export const buildNativeSocialCallbackTarget = (): string =>
  `${MATCH_DEEP_LINK_SCHEME}://${AUTH_CALLBACK_HOST}${AUTH_CALLBACK_PATH}`;

const isSocialProvider = (value: string | null): value is SocialProvider =>
  value === 'google' || value === 'yandex';

export const parseAuthCallbackResult = (rawUrl: string): AuthCallbackResult | null => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const isNativeAuthUrl =
    url.protocol === `${MATCH_DEEP_LINK_SCHEME}:` &&
    url.host === AUTH_CALLBACK_HOST &&
    url.pathname === AUTH_CALLBACK_PATH;
  const isWebAuthUrl = url.searchParams.get('auth') === '1';

  if (!isNativeAuthUrl && !isWebAuthUrl) return null;

  const fragment = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const providerRaw = url.searchParams.get('provider');
  const provider = isSocialProvider(providerRaw) ? providerRaw : undefined;
  const accessToken = fragment.get('access_token') || undefined;
  const error = fragment.get('auth_error') || undefined;
  if (!accessToken && !error) return null;

  return { provider, accessToken, error };
};

export const getInitialAuthCallbackResult = (): AuthCallbackResult | null => {
  if (typeof window === 'undefined') return null;
  return parseAuthCallbackResult(window.location.href);
};

export const buildWidgetDeepLink = (request: Omit<WidgetOpenRequest, 'source' | 'tab'>): string => {
  const url = new URL(`${MATCH_DEEP_LINK_SCHEME}://${MATCH_DEEP_LINK_HOST}${MATCH_DEEP_LINK_PATH}`);
  url.searchParams.set('source', WIDGET_SOURCE);
  url.searchParams.set('tab', 'friends');
  url.searchParams.set('friendId', String(request.friendId));
  if (request.trackId) url.searchParams.set('trackId', String(request.trackId));
  if (request.autoplay) url.searchParams.set('autoplay', '1');
  return url.toString();
};

export const buildWidgetWebUrl = (
  request: Omit<WidgetOpenRequest, 'source' | 'tab'>,
  origin = typeof window === 'undefined' ? 'https://matchapp.site' : window.location.origin
): string => {
  const url = new URL(origin);
  url.searchParams.set('source', WIDGET_SOURCE);
  url.searchParams.set('tab', 'friends');
  url.searchParams.set('friendId', String(request.friendId));
  if (request.trackId) url.searchParams.set('trackId', String(request.trackId));
  if (request.autoplay) url.searchParams.set('autoplay', '1');
  return url.toString();
};

export const clearHandledWidgetParams = (): void => {
  if (typeof window === 'undefined') return;
  const current = new URL(window.location.href);
  if (!isWidgetOpenUrl(current) || current.protocol !== 'http:' && current.protocol !== 'https:') return;

  current.searchParams.delete('source');
  current.searchParams.delete('tab');
  current.searchParams.delete('friendId');
  current.searchParams.delete('trackId');
  current.searchParams.delete('autoplay');
  const nextSearch = current.searchParams.toString();
  const nextUrl = `${current.pathname}${nextSearch ? `?${nextSearch}` : ''}${current.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
};

export const clearHandledAuthParams = (): void => {
  if (typeof window === 'undefined') return;
  const current = new URL(window.location.href);
  if (current.protocol !== 'http:' && current.protocol !== 'https:') return;
  if (current.searchParams.get('auth') !== '1') return;

  current.searchParams.delete('auth');
  current.searchParams.delete('provider');
  const nextSearch = current.searchParams.toString();
  const nextUrl = `${current.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
  window.history.replaceState({}, document.title, nextUrl);
};
