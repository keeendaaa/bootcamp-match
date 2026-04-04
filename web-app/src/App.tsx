import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Search, MessageCircle, User,
  Play, Pause, SkipForward, SkipBack,
  ChevronDown, Heart, Shuffle, Repeat,
  Share2, Send, ArrowLeft, Bell, LogOut,
  Plus, ChevronRight, RefreshCw,
  Mic, MicOff, X
} from 'lucide-react';
import { SONGS, PODCASTS, FRIENDS, CHAT_THREADS, type Song, type Friend, type ChatMessage, type ChatThread } from './data/mockData';
import { getNativePlatform, isNativeApp, listenForAppUrls } from './mobile/capacitor';
import {
  buildNativeSocialCallbackTarget,
  buildSocialCallbackTarget,
  clearHandledAuthParams,
  clearHandledWidgetParams,
  getInitialWidgetOpenRequest,
  getInitialAuthCallbackResult,
  parseAuthCallbackResult,
  parseWidgetOpenRequest,
  type AuthCallbackResult,
  type WidgetOpenRequest,
} from './mobile/deepLinks';
import { NowPlayingDetector, type DeviceNowPlayingTrack } from './mobile/nowPlayingDetector';
import { publishFriendsWidgetSnapshot, WIDGET_SNAPSHOT_REFRESH_MS } from './mobile/widgetBridge';
import './index.css';

type Tab = 'friends' | 'discover' | 'chat' | 'profile';
type ApiUser = { id: number; name: string; email?: string | null; tag?: string | null; avatar_url?: string | null };
type ApiSong = {
  id: number;
  url: string;
  title?: string | null;
  artist?: string | null;
  cover_url?: string | null;
  stream_url?: string | null;
  duration?: string | null;
};
type ApiNowPlaying = { song: ApiSong | null };
type ApiTokenResponse = { access_token: string; user: ApiUser };
type ApiMeResponse = { id: number; name: string; email?: string | null; tag?: string | null; avatar_url?: string | null; now_playing: ApiSong | null };
type ApiProfileStats = { friends: number; tracks: number; likes: number; playlists: number };
type ApiLikedTrack = {
  id: number;
  track_key: string;
  title: string;
  artist: string;
  cover_url: string | null;
  stream_url: string | null;
  source_url: string | null;
  duration: string | null;
};
type ApiSession = {
  id: number;
  host_id: number;
  guest_id: number;
  status: string;
  position_sec: number;
  is_playing: boolean;
  song: ApiSong | null;
  updated_at?: string | null;
};
type ApiSessionMessage = {
  id: number;
  sender_id: number;
  text: string;
  created_at: string;
};
type ApiDirectMessage = {
  id: number;
  sender_id: number;
  recipient_id: number;
  text: string;
  song?: ApiDirectMessageSong | null;
  created_at: string;
};
type ApiDirectMessageSong = {
  title: string;
  artist?: string | null;
  cover_url?: string | null;
  stream_url?: string | null;
  duration?: string | null;
};
type ApiDirectThread = {
  friend: ApiUser;
  last_message: ApiDirectMessage | null;
  unread: number;
};
type AuthMode = 'login' | 'register';
type SocialProvider = 'google' | 'yandex';
type RepeatMode = 'off' | 'all' | 'one';
type ApiMusicSearchItem = {
  video_id: string;
  title: string;
  artist: string;
  duration: string | null;
  cover_url: string | null;
  source_url: string;
  stream_url: string | null;
};
type ApiPodcastSearchItem = {
  podcast_id: string;
  title: string;
  artist: string;
  duration?: string | null;
  cover_url?: string | null;
  source_url?: string | null;
  stream_url?: string | null;
};
type ApiPodcastEpisodeItem = {
  episode_id: string;
  title: string;
  duration?: string | null;
  published_at?: string | null;
  stream_url: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'https://matchapp.site/api';
const API_ORIGIN = API_BASE.replace(/\/api$/, '');
const AUTH_STORAGE_KEY = 'match_backend_token';
const ONBOARDING_SEEN_KEY = 'match_onboarding_seen';
const DEMO_TOKEN = '__MATCH_DEMO__';
const AVATAR_POOL = ['/avatars/danya.jpg', '/avatars/oleg.jpg', '/avatars/aleksandr.jpg', '/avatars/galya.jpg'];
const LAST_ACTIVE_POOL = ['Только что', '2 мин назад', '10 мин назад', '1 ч назад'];
const FRIENDS_POLL_INTERVAL_MS = 700;
const FRIENDS_POLL_HIDDEN_INTERVAL_MS = 1_500;
const NOW_PLAYING_HEARTBEAT_MS = 5_000;
const SESSION_POLL_INTERVAL_MS = 1_500;
const DEVICE_NOW_PLAYING_POLL_INTERVAL_MS = 4_000;
const DEMO_USER: ApiUser = { id: 0, name: 'Demo User', email: 'demo@match.app', tag: 'demo', avatar_url: '/avatars/user.jpg' };

const toUsername = (name: string) =>
  `@${name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'user'}`;

const titleFromUrl = (url: string, fallback: string) => {
  try {
    const parsed = new URL(url);
    const raw = parsed.pathname.split('/').pop() || '';
    const clean = decodeURIComponent(raw).replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
    return clean ? clean[0].toUpperCase() + clean.slice(1) : fallback;
  } catch {
    return fallback;
  }
};

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const trimSongTitle = (title: string, max = 72): string => {
  const clean = title.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
};

const normalizeBackendFileUrl = (raw?: string | null): string | undefined => {
  if (!raw) return undefined;
  if (raw.startsWith('/api/files/')) return `${API_ORIGIN}${raw}`;
  if (raw.startsWith('/files/')) return `${API_BASE}${raw}`;
  try {
    const parsed = new URL(raw, API_ORIGIN);
    const pathWithSearch = `${parsed.pathname}${parsed.search}`;
    if (parsed.pathname.startsWith('/api/files/')) return `${API_ORIGIN}${pathWithSearch}`;
    if (parsed.pathname.startsWith('/files/')) return `${API_BASE}${pathWithSearch}`;
  } catch {
    // noop
  }
  return raw;
};

const normalizePlayableUrl = (raw?: string | null): string | undefined => {
  if (!raw) return undefined;
  if (raw.startsWith('/music/stream/')) return `${API_BASE}${raw}`;
  if (raw.startsWith('/podcasts/stream/')) return `${API_BASE}${raw}`;
  if (raw.startsWith('/api/music/stream/')) return `${API_ORIGIN}${raw}`;
  if (raw.startsWith('/api/podcasts/stream/')) return `${API_ORIGIN}${raw}`;

  const normalizedFileUrl = normalizeBackendFileUrl(raw);
  if (normalizedFileUrl && normalizedFileUrl !== raw) return normalizedFileUrl;

  try {
    const parsed = new URL(raw, API_ORIGIN);
    const pathWithSearch = `${parsed.pathname}${parsed.search}`;
    if (parsed.pathname.startsWith('/music/stream/')) return `${API_BASE}${pathWithSearch}`;
    if (parsed.pathname.startsWith('/podcasts/stream/')) return `${API_BASE}${pathWithSearch}`;
    if (parsed.pathname.startsWith('/api/music/stream/')) return `${API_ORIGIN}${pathWithSearch}`;
    if (parsed.pathname.startsWith('/api/podcasts/stream/')) return `${API_ORIGIN}${pathWithSearch}`;
    if (/^https?:$/i.test(parsed.protocol)) return raw;
  } catch {
    // noop
  }
  return undefined;
};

const decodePodcastStreamToken = (token: string): string | null => {
  const normalizedToken = token.replace(/-/g, '+').replace(/_/g, '/');
  const paddedToken = normalizedToken.padEnd(Math.ceil(normalizedToken.length / 4) * 4, '=');
  try {
    return atob(paddedToken);
  } catch {
    return null;
  }
};

const extractDirectPodcastUrlFromProxy = (rawUrl?: string | null): string | null => {
  const normalized = normalizePlayableUrl(rawUrl);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    const marker = '/podcasts/stream/';
    const markerIdx = parsed.pathname.indexOf(marker);
    if (markerIdx < 0) return null;
    const token = parsed.pathname.slice(markerIdx + marker.length).split('/')[0];
    if (!token) return null;

    const decoded = decodePodcastStreamToken(token);
    if (!decoded) return null;

    const encodedUrlMatch = decoded.match(/https?%3A%2F%2F[^\s"']+/i);
    if (encodedUrlMatch?.[0]) {
      try {
        return decodeURIComponent(encodedUrlMatch[0]);
      } catch {
        return null;
      }
    }

    const plainUrlMatch = decoded.match(/https?:\/\/[^\s"']+/i);
    if (plainUrlMatch?.[0]) return plainUrlMatch[0];
    return null;
  } catch {
    return null;
  }
};

const trackKeyOfSong = (song: Song): string => {
  if (song.streamUrl?.startsWith('/music/stream/')) {
    return song.streamUrl.replace('/music/stream/', 'yt:');
  }
  if (song.streamUrl) return `stream:${song.streamUrl}`;
  return `local:${song.id}:${song.title}:${song.artist}`;
};

const normalizeMatchText = (value?: string | null): string =>
  (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim();

const mapMusicSearchItemToSong = (item: ApiMusicSearchItem, idx: number): Song => ({
  id: 8_000_000 + idx,
  title: trimSongTitle(item.title),
  artist: item.artist || 'Unknown Artist',
  cover: item.cover_url || SONGS[idx % SONGS.length].cover,
  duration: item.duration || '—',
  streamUrl: item.stream_url || undefined,
});

const scoreSongMatch = (song: Song, title: string, artist?: string): number => {
  const songTitle = normalizeMatchText(song.title);
  const songArtist = normalizeMatchText(song.artist);
  const targetTitle = normalizeMatchText(title);
  const targetArtist = normalizeMatchText(artist);
  if (!songTitle || !targetTitle) return 0;

  let score = 0;

  if (songTitle === targetTitle) score += 72;
  else if (songTitle.includes(targetTitle) || targetTitle.includes(songTitle)) score += 52;

  const titleWords = targetTitle.split(' ').filter(Boolean);
  const songTitleWords = new Set(songTitle.split(' ').filter(Boolean));
  const sharedTitleWords = titleWords.filter((word) => songTitleWords.has(word)).length;
  score += Math.min(24, sharedTitleWords * 8);

  if (targetArtist) {
    if (songArtist === targetArtist) score += 30;
    else if (songArtist.includes(targetArtist) || targetArtist.includes(songArtist)) score += 18;

    const artistWords = targetArtist.split(' ').filter(Boolean);
    const songArtistWords = new Set(songArtist.split(' ').filter(Boolean));
    const sharedArtistWords = artistWords.filter((word) => songArtistWords.has(word)).length;
    score += Math.min(14, sharedArtistWords * 7);
  }

  return score;
};

const pickBestSongMatch = (songs: Song[], title: string, artist?: string, threshold = 66): Song | null => {
  let best: { song: Song; score: number } | null = null;
  for (const song of songs) {
    const score = scoreSongMatch(song, title, artist);
    if (!best || score > best.score) best = { song, score };
  }
  return best && best.score >= threshold ? best.song : null;
};

const normalizeAvatarUrl = (raw?: string | null): string | undefined => {
  if (!raw) return undefined;
  if (raw.startsWith('https://matchapp.site/files/')) {
    return raw.replace('https://matchapp.site/files/', 'https://matchapp.site/api/files/');
  }
  return normalizeBackendFileUrl(raw);
};

const mapBackendSongToUiSong = (song: ApiSong, idx: number): Song => {
  const base = SONGS[idx % SONGS.length];
  const rawUrl = song.stream_url || song.url || '';
  const streamUrl = normalizePlayableUrl(rawUrl);
  return {
    ...base,
    id: 4_000_000 + song.id,
    title: trimSongTitle(song.title || titleFromUrl(song.url, `Трек #${song.id}`)),
    artist: song.artist || 'Друг',
    cover: song.cover_url || base.cover,
    duration: song.duration || base.duration,
    streamUrl,
  };
};

const mapLikedTrackToSong = (track: ApiLikedTrack, idx: number): Song => {
  const base = SONGS[idx % SONGS.length];
  let derivedStreamUrl: string | undefined = track.stream_url || undefined;
  if (!derivedStreamUrl && track.track_key.startsWith('yt:')) {
    const videoId = track.track_key.slice(3).trim();
    if (videoId) derivedStreamUrl = `/music/stream/${videoId}`;
  }
  if (!derivedStreamUrl && track.source_url) {
    try {
      const parsed = new URL(track.source_url);
      const videoId = parsed.searchParams.get('v') || '';
      if (videoId) derivedStreamUrl = `/music/stream/${videoId}`;
    } catch {
      // noop
    }
  }
  return {
    id: 3_000_000 + idx,
    title: trimSongTitle(track.title),
    artist: track.artist || 'Unknown Artist',
    cover: track.cover_url || base.cover,
    duration: track.duration || '—',
    streamUrl: derivedStreamUrl,
  };
};

const mapSessionSongToUiSong = (song: ApiSong): Song => {
  const base = SONGS[0];
  const rawUrl = song.stream_url || song.url || '';
  const streamUrl = normalizePlayableUrl(rawUrl);
  return {
    ...base,
    id: 5_000_000 + song.id,
    title: trimSongTitle(song.title || titleFromUrl(song.url, `Трек #${song.id}`)),
    artist: song.artist || 'Друг',
    cover: song.cover_url || base.cover,
    duration: song.duration || base.duration,
    streamUrl,
  };
};

const mapUploadedSongToUiSong = (song: ApiSong, fallbackName?: string): Song => {
  const mapped = mapSessionSongToUiSong(song);
  return {
    ...mapped,
    title: trimSongTitle(song.title || titleFromUrl(song.url, fallbackName || `Трек #${song.id}`)),
    artist: song.artist || 'Вы',
    duration: song.duration || 'Локальный файл',
  };
};

const mapFriendSongToUiSong = (song: ApiSong, idx: number, friendName: string): Song => {
  const mapped = mapBackendSongToUiSong(song, idx);
  return {
    ...mapped,
    artist: song.artist || friendName,
  };
};

const mergeUniqueSongs = (songs: Song[]): Song[] => {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const key = trackKeyOfSong(song);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getSessionTargetSec = (session: ApiSession): number => {
  const base = Math.max(0, session.position_sec || 0);
  if (!session.is_playing || !session.updated_at) return base;
  const ts = Date.parse(session.updated_at);
  if (!Number.isFinite(ts)) return base;
  const elapsed = (Date.now() - ts) / 1000;
  return Math.max(0, base + Math.max(0, elapsed));
};

const formatChatTime = (iso: string): string => {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'Сейчас';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Сейчас';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} мин назад`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ч назад`;
  const date = new Date(ts);
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const mapDirectMessageToChatMessage = (message: ApiDirectMessage): ChatMessage => ({
  id: message.id,
  senderId: message.sender_id,
  text: message.text,
  time: formatChatTime(message.created_at),
  songShare: message.song
    ? {
        id: 6_000_000 + message.id,
        title: trimSongTitle(message.song.title),
        artist: message.song.artist || 'Unknown Artist',
        cover: message.song.cover_url || SONGS[message.id % SONGS.length].cover,
        duration: message.song.duration || '—',
        streamUrl: message.song.stream_url || undefined,
      }
    : undefined,
});

const mapApiUserToFriend = (user: ApiUser, idx: number): Friend => ({
  id: user.id,
  name: user.name,
  username: user.tag ? `@${user.tag}` : toUsername(user.name),
  avatar: normalizeAvatarUrl(user.avatar_url) || AVATAR_POOL[idx % AVATAR_POOL.length] || AVATAR_POOL[0],
  isOnline: true,
  isListening: false,
  lastActive: LAST_ACTIVE_POOL[idx % LAST_ACTIVE_POOL.length],
});

const isDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  const localFlag = localStorage.getItem('match_debug') === '1';
  const globalFlag = Boolean((window as typeof window & { __MATCH_DEBUG__?: boolean }).__MATCH_DEBUG__);
  return localFlag || globalFlag;
};

const debugLog = (...args: unknown[]) => {
  if (!isDebugEnabled()) return;
  console.log('[match-debug]', ...args);
};

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error('NETWORK_ERROR');
  }
  if (!res.ok) {
    let detailMessage = res.statusText;
    const text = await res.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { detail?: string | Array<{ msg?: string }> };
        if (typeof parsed.detail === 'string') {
          detailMessage = parsed.detail;
        } else if (Array.isArray(parsed.detail) && parsed.detail.length > 0) {
          detailMessage = parsed.detail.map((item) => item.msg || '').filter(Boolean).join('; ') || detailMessage;
        } else {
          detailMessage = text;
        }
      } catch {
        detailMessage = text;
      }
    }
    throw new Error(`API ${res.status}: ${detailMessage}`);
  }
  return res.json() as Promise<T>;
}

function formatUserFacingError(err: unknown, fallback = 'Что-то пошло не так'): string {
  const raw = err instanceof Error ? err.message : fallback;
  const statusMatch = raw.match(/^API\s+(\d+):\s*/i);
  const status = statusMatch ? Number.parseInt(statusMatch[1], 10) : null;
  const message = raw.replace(/^API\s+\d+:\s*/i, '').trim();
  const lower = message.toLowerCase();
  const rawLower = raw.toLowerCase();

  if (
    raw === 'NETWORK_ERROR' ||
    rawLower.includes('failed to fetch') ||
    rawLower.includes('networkerror') ||
    rawLower.includes('load failed') ||
    rawLower.includes('network request failed')
  ) {
    return 'Нет соединения с сервером. Проверьте интернет или доступность API.';
  }

  if (status === 401 || lower.includes('invalid credentials')) {
    return 'Нужно войти заново или проверить правильность email и пароля.';
  }
  if (status === 403 || lower === 'forbidden' || lower.includes('not friends')) {
    return 'Действие недоступно: не хватает прав или пользователь не у вас в друзьях.';
  }
  if (status === 404 && lower.includes('user not found')) return 'Пользователь не найден.';
  if (status === 404 && lower.includes('friend not found')) return 'Друг не найден.';
  if (status === 404 && lower.includes('song not found')) return 'Трек не найден на сервере.';
  if (status === 404 && lower.includes('session not found')) return 'Совместная сессия не найдена.';
  if (status === 404) return 'Нужные данные не найдены.';
  if (status === 413 || lower.includes('request entity too large') || lower.includes('payload too large')) {
    return 'Файл слишком большой для текущего лимита загрузки на сервере.';
  }
  if (status === 429) return 'Слишком много запросов. Попробуйте еще раз чуть позже.';
  if (status !== null && status >= 500) {
    return 'Сервер временно недоступен. Попробуйте еще раз позже.';
  }

  if (lower.includes('email already registered')) return 'Этот email уже зарегистрирован.';
  if (lower.includes('name already exists')) return 'Это имя уже занято.';
  if (lower.includes('user not found')) return 'Пользователь не найден.';
  if (lower.includes('friend not found')) return 'Друг не найден.';
  if (lower.includes('cannot add yourself')) return 'Нельзя добавить самого себя.';
  if (lower.includes('use @tag to add friends')) return 'Добавляйте друзей по тегу в формате @username.';
  if (lower.includes('invalid tag')) return 'Укажите корректный тег.';
  if (lower.includes('tag is too short')) return 'Тег должен быть не короче 2 символов.';
  if (lower.includes('field required')) return 'Заполните все обязательные поля.';
  if (lower.includes('string should have at least')) return 'Одно из полей заполнено слишком коротко.';
  if (lower.includes('at least 6 characters')) return 'Пароль слишком короткий. Минимум 6 символов.';
  if (lower.includes('unsupported avatar format')) return 'Аватар должен быть в формате PNG, JPEG или WEBP.';
  if (lower.includes('file name is required') || lower.includes('invalid file name')) return 'Файл не удалось прочитать. Выберите другой.';
  if (lower.includes('failed to resolve stream') || lower.includes('upstream stream error')) {
    return 'Источник аудио временно недоступен.';
  }
  if (lower.includes('session ended')) return 'Совместное прослушивание уже завершено.';
  if (lower.includes('session already ended')) return 'Эта сессия уже завершена.';

  return message || fallback;
}

function formatAuthError(err: unknown): string {
  return formatUserFacingError(err, 'Ошибка авторизации');
}

export default function App() {
  const [tab, setTab] = useState<Tab>('friends');
  const [isPlaying, setIsPlaying] = useState(false);
  const [songIndex, setSongIndex] = useState(0);
  const [npOpen, setNpOpen] = useState(false);
  const [openChat, setOpenChat] = useState<ChatThread | null>(null);
  const [shareModal, setShareModal] = useState<Song | null>(null);
  const [friendProfile, setFriendProfile] = useState<Friend | null>(null);
  const [friendProfileSongs, setFriendProfileSongs] = useState<Song[]>([]);
  const [friendProfileLoading, setFriendProfileLoading] = useState(false);
  const [friendProfileError, setFriendProfileError] = useState('');
  const [listeningWith, setListeningWith] = useState<Friend | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [customSong, setCustomSong] = useState<Song | null>(null);
  const [token, setToken] = useState<string>(() => localStorage.getItem(AUTH_STORAGE_KEY) || '');
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => !localStorage.getItem(ONBOARDING_SEEN_KEY));
  const [authError, setAuthError] = useState('');
  const [authCallback, setAuthCallback] = useState<AuthCallbackResult | null>(() => getInitialAuthCallbackResult());
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [profileStats, setProfileStats] = useState<ApiProfileStats>({ friends: 0, tracks: 0, likes: 0, playlists: 0 });
  const [likedTrackKeys, setLikedTrackKeys] = useState<Set<string>>(new Set());
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [deviceNowPlayingSupported, setDeviceNowPlayingSupported] = useState(false);
  const [deviceNowPlayingAccessGranted, setDeviceNowPlayingAccessGranted] = useState(false);
  const [deviceNowPlayingTrack, setDeviceNowPlayingTrack] = useState<DeviceNowPlayingTrack | null>(null);
  const [deviceNowPlayingMatch, setDeviceNowPlayingMatch] = useState<Song | null>(null);
  const [deviceNowPlayingLoading, setDeviceNowPlayingLoading] = useState(false);
  const [deviceNowPlayingResolving, setDeviceNowPlayingResolving] = useState(false);
  const [deviceNowPlayingError, setDeviceNowPlayingError] = useState('');
  const [activeSession, setActiveSession] = useState<ApiSession | null>(null);
  const [sessionMessages, setSessionMessages] = useState<ApiSessionMessage[]>([]);
  const [currentBackendSongId, setCurrentBackendSongId] = useState<number | null>(null);
  const [activeQueue, setActiveQueue] = useState<Song[] | null>(null);
  const [queueIndex, setQueueIndex] = useState<number | null>(null);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [pendingWidgetRequest, setPendingWidgetRequest] = useState<WidgetOpenRequest | null>(() => getInitialWidgetOpenRequest());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const friendsRef = useRef<Friend[]>([]);
  const currentSongRef = useRef<Song>(SONGS[0]);
  const shuffleRef = useRef(shuffleOn);
  const repeatModeRef = useRef<RepeatMode>(repeatMode);
  const nextTrackRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef(token);
  const clearNowPlayingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const friendsPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const friendsLoadInFlightRef = useRef(false);
  const chatThreadsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageIdRef = useRef(0);
  const handledInviteIdsRef = useRef<Set<number>>(new Set());
  const suppressSessionSyncRef = useRef(false);
  const lastAppliedSessionSongIdRef = useRef<number | null>(null);
  const lastAutoOpenedSessionIdRef = useRef<number | null>(null);
  const lastResolvedDeviceTrackKeyRef = useRef('');
  const isDemoMode = token === DEMO_TOKEN;

  const currentSong = customSong || SONGS[songIndex];
  const selectSongInPlayer = (song: Song) => {
    const idx = SONGS.findIndex((item) => item.id === song.id);
    if (idx >= 0) {
      setSongIndex(idx);
      setCustomSong(null);
      return;
    }
    setCustomSong(song);
  };
  const resolveStreamUrl = (song: Song): string | null => {
    return normalizePlayableUrl(song.streamUrl) || null;
  };

  const resolveFreshPodcastSong = async (song: Song): Promise<Song | null> => {
    const rawStream = song.streamUrl || '';
    if (!rawStream.includes('/podcasts/stream/')) return null;

    const query = `${song.title} ${song.artist}`.trim();
    if (!query) return null;

    try {
      const accessToken = isDemoMode ? undefined : tokenRef.current || undefined;
      const podcasts = await apiRequest<ApiPodcastSearchItem[]>(
        `/podcasts/search?q=${encodeURIComponent(query)}&limit=8`,
        {},
        accessToken
      );
      if (!podcasts.length) return null;

      const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
      const artistNeedle = norm(song.artist || '');
      const podcast =
        podcasts.find((p) => artistNeedle && norm(p.artist || '').includes(artistNeedle)) ||
        podcasts[0];
      if (!podcast?.podcast_id) return null;

      const episodes = await apiRequest<ApiPodcastEpisodeItem[]>(
        `/podcasts/${encodeURIComponent(podcast.podcast_id)}/episodes?limit=20`,
        {},
        accessToken
      );
      if (!episodes.length) return null;

      const titleNeedle = norm(song.title || '');
      const episode =
        episodes.find((ep) => titleNeedle && norm(ep.title || '').includes(titleNeedle)) ||
        episodes[0];
      if (!episode?.stream_url) return null;

      return {
        ...song,
        title: episode.title || song.title,
        artist: podcast.artist || song.artist,
        cover: podcast.cover_url || song.cover,
        duration: episode.duration || song.duration,
        streamUrl: episode.stream_url,
      };
    } catch (err) {
      debugLog('resolveFreshPodcastSong failed', err);
      return null;
    }
  };

  const startPlayback = async (song: Song) => {
    const audio = audioRef.current;
    if (!audio) return;

    let playbackSong = song;
    let streamUrl = resolveStreamUrl(playbackSong);
    debugLog('startPlayback called', {
      songId: playbackSong.id,
      title: playbackSong.title,
      artist: playbackSong.artist,
      rawStreamUrl: playbackSong.streamUrl,
      resolvedStreamUrl: streamUrl,
      isDemoMode,
    });
    if (!streamUrl) {
      setPlayerError('Для этого трека нет доступного аудио-потока');
      setIsPlaying(false);
      return;
    }

    setPlayerError('');
    try {
      const probe = await fetch(streamUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-1' },
      });
      debugLog('stream probe', {
        url: streamUrl,
        status: probe.status,
        ok: probe.ok,
        contentType: probe.headers.get('content-type'),
      });
      if (!probe.ok) {
        const directFallbackUrl = extractDirectPodcastUrlFromProxy(streamUrl);
        if (directFallbackUrl) {
          playbackSong = { ...playbackSong, streamUrl: directFallbackUrl };
          streamUrl = directFallbackUrl;
          selectSongInPlayer(playbackSong);
        } else {
          const maybeRefreshed = await resolveFreshPodcastSong(playbackSong);
          if (maybeRefreshed) {
            playbackSong = maybeRefreshed;
            streamUrl = resolveStreamUrl(playbackSong);
            if (!streamUrl) {
              setPlayerError('Поток недоступен');
              setIsPlaying(false);
              return;
            }

            const refreshedDirectFallbackUrl = extractDirectPodcastUrlFromProxy(streamUrl);
            if (refreshedDirectFallbackUrl) {
              playbackSong = { ...playbackSong, streamUrl: refreshedDirectFallbackUrl };
              streamUrl = refreshedDirectFallbackUrl;
            }
            selectSongInPlayer(playbackSong);
          } else {
            setPlayerError('Поток недоступен');
            setIsPlaying(false);
            return;
          }
        }
      }
    } catch (err) {
      debugLog('stream probe failed', err);
    }
    if (clearNowPlayingTimerRef.current) {
      clearTimeout(clearNowPlayingTimerRef.current);
      clearNowPlayingTimerRef.current = null;
    }
    if (!streamUrl) {
      setPlayerError('Поток недоступен');
      setIsPlaying(false);
      return;
    }
    if (audio.src !== streamUrl) {
      audio.src = streamUrl;
      audio.load();
    }

    try {
      await audio.play();
      setIsPlaying(true);
      debugLog('audio.play success', { currentTime: audio.currentTime, src: audio.src });
    } catch (err) {
      const details = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      debugLog('audio.play failed', details);
      setPlayerError('Не удалось начать воспроизведение');
      setIsPlaying(false);
    }
  };

  const next = () => {
    if (activeQueue && activeQueue.length > 0 && queueIndex !== null) {
      let nextIdx: number;
      if (shuffleOn && activeQueue.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * activeQueue.length);
        } while (nextIdx === queueIndex);
      } else {
        nextIdx = (queueIndex + 1) % activeQueue.length;
      }
      const nextSong = activeQueue[nextIdx];
      setQueueIndex(nextIdx);
      const builtinIdx = SONGS.findIndex((s) => s.id === nextSong.id);
      if (builtinIdx >= 0) {
        setSongIndex(builtinIdx);
        setCustomSong(null);
      } else {
        setCustomSong(nextSong);
      }
      setListeningWith(null);
      void startPlayback(nextSong);
      return;
    }
    setCustomSong(null);
    let nextIdx: number;
    if (shuffleOn && SONGS.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * SONGS.length);
      } while (nextIdx === songIndex);
    } else {
      nextIdx = (songIndex + 1) % SONGS.length;
    }
    const nextSong = SONGS[nextIdx];
    setSongIndex(nextIdx);
    void startPlayback(nextSong);
  };
  const prev = () => {
    if (activeQueue && activeQueue.length > 0 && queueIndex !== null) {
      let prevIdx: number;
      if (shuffleOn && activeQueue.length > 1) {
        do {
          prevIdx = Math.floor(Math.random() * activeQueue.length);
        } while (prevIdx === queueIndex);
      } else {
        prevIdx = (queueIndex - 1 + activeQueue.length) % activeQueue.length;
      }
      const prevSong = activeQueue[prevIdx];
      setQueueIndex(prevIdx);
      const builtinIdx = SONGS.findIndex((s) => s.id === prevSong.id);
      if (builtinIdx >= 0) {
        setSongIndex(builtinIdx);
        setCustomSong(null);
      } else {
        setCustomSong(prevSong);
      }
      setListeningWith(null);
      void startPlayback(prevSong);
      return;
    }
    setCustomSong(null);
    let prevIdx: number;
    if (shuffleOn && SONGS.length > 1) {
      do {
        prevIdx = Math.floor(Math.random() * SONGS.length);
      } while (prevIdx === songIndex);
    } else {
      prevIdx = (songIndex - 1 + SONGS.length) % SONGS.length;
    }
    const prevSong = SONGS[prevIdx];
    setSongIndex(prevIdx);
    void startPlayback(prevSong);
  };
  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void startPlayback(currentSong);
    }
  };

  const seekTo = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (duration <= 0) return;
    const clamped = Math.max(0, Math.min(nextTime, duration));
    audio.currentTime = clamped;
    setCurrentTimeSec(clamped);
  };

  const toggleShuffle = () => setShuffleOn((prev) => !prev);
  const cycleRepeat = () =>
    setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));

  const enqueueSong = (song: Song) => {
    const currentSongItem = currentSongRef.current;
    const incomingKey = trackKeyOfSong(song);
    const currentKey = trackKeyOfSong(currentSongItem);

    setActiveQueue((prev) => {
      const baseQueue = prev && prev.length > 0 ? prev : [currentSongItem];
      if (baseQueue.some((item) => trackKeyOfSong(item) === incomingKey)) return baseQueue;
      if (!prev && incomingKey === currentKey) return baseQueue;
      return [...baseQueue, song];
    });
    setQueueIndex((prev) => (prev === null ? 0 : prev));
  };

  const removeFromQueue = (index: number) => {
    if (!activeQueue || activeQueue.length === 0 || queueIndex === null) return;
    if (index === queueIndex) return;

    const nextQueue = activeQueue.filter((_, itemIdx) => itemIdx !== index);
    setActiveQueue(nextQueue.length > 0 ? nextQueue : null);
    if (index < queueIndex) setQueueIndex(Math.max(0, queueIndex - 1));
  };

  const playFromQueue = (index: number) => {
    if (!activeQueue || index < 0 || index >= activeQueue.length) return;
    playSong(activeQueue[index], undefined, activeQueue, index);
    setNpOpen(true);
  };

  const refreshDeviceNowPlaying = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!isNativeApp() || getNativePlatform() !== 'android') {
      setDeviceNowPlayingSupported(false);
      setDeviceNowPlayingAccessGranted(false);
      setDeviceNowPlayingTrack(null);
      setDeviceNowPlayingMatch(null);
      setDeviceNowPlayingLoading(false);
      return;
    }

    if (!silent) setDeviceNowPlayingLoading(true);
    try {
      const snapshot = await NowPlayingDetector.getCurrentTrack();
      setDeviceNowPlayingSupported(snapshot.supported);
      setDeviceNowPlayingAccessGranted(snapshot.accessGranted);
      setDeviceNowPlayingTrack(snapshot.track);
      if (!snapshot.track) {
        setDeviceNowPlayingMatch(null);
        lastResolvedDeviceTrackKeyRef.current = '';
      }
      setDeviceNowPlayingError('');
    } catch (err) {
      setDeviceNowPlayingError(formatUserFacingError(err, 'Не удалось прочитать музыку с устройства'));
    } finally {
      if (!silent) setDeviceNowPlayingLoading(false);
    }
  };

  const openDeviceAccessSettings = async () => {
    try {
      await NowPlayingDetector.openAccessSettings();
    } catch (err) {
      setDeviceNowPlayingError(formatUserFacingError(err, 'Не удалось открыть настройки доступа'));
    }
  };

  const clearNowPlayingOnBackend = async () => {
    const accessToken = tokenRef.current;
    if (accessToken === DEMO_TOKEN) return;
    if (!accessToken) return;
    try {
      await apiRequest<{ ok: boolean }>('/me/now-playing', { method: 'DELETE' }, accessToken);
    } catch {
      // no-op: transient failures here are acceptable
    }
  };

  const touchNowPlayingOnBackend = async () => {
    const accessToken = tokenRef.current;
    if (accessToken === DEMO_TOKEN) return;
    if (!accessToken) return;
    try {
      await apiRequest<{ ok: boolean }>('/me/now-playing/heartbeat', { method: 'POST' }, accessToken);
    } catch {
      // no-op: heartbeat failures are non-critical
    }
  };

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);

  useEffect(() => {
    shuffleRef.current = shuffleOn;
  }, [shuffleOn]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    nextTrackRef.current = next;
  }, [next]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    if (!token || !isPlaying || !currentBackendSongId) return;
    const timer = setInterval(() => {
      void touchNowPlayingOnBackend();
    }, NOW_PLAYING_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [token, isPlaying, currentBackendSongId]);

  const clearSession = () => {
    if (clearNowPlayingTimerRef.current) {
      clearTimeout(clearNowPlayingTimerRef.current);
      clearNowPlayingTimerRef.current = null;
    }
    void clearNowPlayingOnBackend();
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setToken('');
    setCurrentUser(null);
    setFriends([]);
    setChatThreads([]);
    setOpenChat(null);
    setFriendProfile(null);
    setFriendProfileSongs([]);
    setFriendProfileError('');
    setAuthError('');
    setProfileStats({ friends: 0, tracks: 0, likes: 0, playlists: 0 });
    setLikedTrackKeys(new Set());
    setLikedSongs([]);
    setRecentSongs([]);
    audioRef.current?.pause();
    setIsPlaying(false);
    void publishFriendsWidgetSnapshot([], undefined).catch(() => undefined);
  };

  const enterDemoMode = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    setShowOnboarding(false);
    setToken(DEMO_TOKEN);
    setCurrentUser(DEMO_USER);
    setAuthError('');
    setTab('friends');
  };

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    setShowOnboarding(false);
  };

  const startSocialAuth = (provider: SocialProvider) => {
    const target = isNativeApp() ? buildNativeSocialCallbackTarget() : buildSocialCallbackTarget();
    const startUrl = `${API_BASE}/auth/${provider}/start?origin=${encodeURIComponent(target)}`;
    window.location.assign(startUrl);
  };

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audioRef.current = audio;
    const syncDuration = () => {
      const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDurationSec(nextDuration);
    };
    const syncTime = () => setCurrentTimeSec(audio.currentTime || 0);
    const onPlay = () => {
      debugLog('audio event: play', { src: audio.src });
      if (clearNowPlayingTimerRef.current) {
        clearTimeout(clearNowPlayingTimerRef.current);
        clearNowPlayingTimerRef.current = null;
      }
      setIsPlaying(true);
    };
    const onPause = () => {
      debugLog('audio event: pause', { currentTime: audio.currentTime });
      setIsPlaying(false);
      if (clearNowPlayingTimerRef.current) clearTimeout(clearNowPlayingTimerRef.current);
      clearNowPlayingTimerRef.current = setTimeout(() => {
        void clearNowPlayingOnBackend();
      }, 1200);
    };
    const onEnded = async () => {
      debugLog('audio event: ended', { currentTime: audio.currentTime, duration: audio.duration });
      syncTime();
      if (clearNowPlayingTimerRef.current) {
        clearTimeout(clearNowPlayingTimerRef.current);
        clearNowPlayingTimerRef.current = null;
      }
      if (repeatModeRef.current === 'one') {
        audio.currentTime = 0;
        try {
          await audio.play();
          setIsPlaying(true);
        } catch {
          setIsPlaying(false);
        }
        return;
      }
      if (repeatModeRef.current === 'all' || shuffleRef.current) {
        nextTrackRef.current?.();
        return;
      }
      void clearNowPlayingOnBackend();
      setIsPlaying(false);
    };
    const onError = () => {
      const mediaError = audio.error;
      const code = mediaError?.code || 0;
      const map: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
      };
      const label = map[code] || 'UNKNOWN_MEDIA_ERROR';
      debugLog('audio event: error', {
        code,
        label,
        message: mediaError?.message || '',
        networkState: audio.networkState,
        readyState: audio.readyState,
        src: audio.src,
      });
      setPlayerError('Не удалось воспроизвести трек');
    };
    const onStalled = () => debugLog('audio event: stalled', { currentTime: audio.currentTime, src: audio.src });
    const onWaiting = () => debugLog('audio event: waiting', { currentTime: audio.currentTime });
    const onCanPlay = () => debugLog('audio event: canplay', { duration: audio.duration, src: audio.src });
    const onPlaying = () => debugLog('audio event: playing', { currentTime: audio.currentTime });
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('stalled', onStalled);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('timeupdate', syncTime);
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    return () => {
      if (clearNowPlayingTimerRef.current) {
        clearTimeout(clearNowPlayingTimerRef.current);
        clearNowPlayingTimerRef.current = null;
      }
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('stalled', onStalled);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('timeupdate', syncTime);
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as typeof window & {
      matchDebug?: {
        enable: () => void;
        disable: () => void;
        status: () => { enabled: boolean; token: string; song: string };
      };
      __MATCH_DEBUG__?: boolean;
    };
    w.matchDebug = {
      enable: () => {
        localStorage.setItem('match_debug', '1');
        w.__MATCH_DEBUG__ = true;
        console.log('[match-debug] enabled');
      },
      disable: () => {
        localStorage.removeItem('match_debug');
        w.__MATCH_DEBUG__ = false;
        console.log('[match-debug] disabled');
      },
      status: () => ({ enabled: isDebugEnabled(), token, song: currentSongRef.current.title }),
    };
    debugLog('matchDebug helper available: window.matchDebug.enable()/disable()/status()');
  }, [token]);

  useEffect(() => {
    let handle: { remove: () => Promise<void> } | null = null;
    void listenForAppUrls((url) => {
      const authResult = parseAuthCallbackResult(url);
      if (authResult) {
        setAuthCallback(authResult);
        return;
      }
      const request = parseWidgetOpenRequest(url);
      if (request) setPendingWidgetRequest(request);
    }).then((listener) => {
      handle = listener;
    });
    return () => {
      void handle?.remove();
    };
  }, []);

  useEffect(() => {
    if (!authCallback) return;
    if (authCallback.error) {
      setAuthError(decodeURIComponent(authCallback.error));
      setAuthCallback(null);
      clearHandledAuthParams();
      return;
    }
    if (!authCallback.accessToken) return;

    localStorage.setItem(AUTH_STORAGE_KEY, authCallback.accessToken);
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    setShowOnboarding(false);
    setAuthError('');
    setCurrentUser(null);
    setAuthReady(false);
    setToken(authCallback.accessToken);
    setAuthCallback(null);
    clearHandledAuthParams();
  }, [authCallback]);

  const loadFriends = async (accessToken: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setIsLoadingData(true);
    try {
      const backendFriends = await apiRequest<ApiUser[]>('/friends', {}, accessToken);
      const mapped = await Promise.all(
        backendFriends.map(async (bf, idx) => {
          let nowPlaying: ApiNowPlaying | null = null;
          try {
            nowPlaying = await apiRequest<ApiNowPlaying>(`/friends/${bf.id}/now-playing`, {}, accessToken);
          } catch {
            nowPlaying = null;
          }

          const fallback = FRIENDS[idx % FRIENDS.length] || FRIENDS[0];
          const previous = friendsRef.current.find((friend) => friend.id === bf.id);
          const currentSong = nowPlaying?.song ? mapBackendSongToUiSong(nowPlaying.song, idx) : undefined;

          return {
            id: bf.id,
            name: bf.name,
            username: toUsername(bf.name),
            avatar: normalizeAvatarUrl(bf.avatar_url) || AVATAR_POOL[idx % AVATAR_POOL.length] || fallback.avatar,
            isOnline: true,
            isListening: Boolean(nowPlaying?.song),
            currentSong,
            lastActive: previous?.lastActive || LAST_ACTIVE_POOL[idx % LAST_ACTIVE_POOL.length],
          } satisfies Friend;
        })
      );

      setFriends(mapped);
      try {
        await loadChatThreads(accessToken, { baseFriends: mapped });
      } catch {
        // noop: friends are still usable even if chat threads failed to refresh
      }
    } finally {
      if (!silent) setIsLoadingData(false);
    }
  };

  const loadChatThreads = async (accessToken: string, options?: { baseFriends?: Friend[] }) => {
    const baseFriends = options?.baseFriends || friendsRef.current;
    const remoteThreads = await apiRequest<ApiDirectThread[]>('/chats/threads', {}, accessToken);
    const mappedThreads: ChatThread[] = remoteThreads.map((thread, idx) => {
      const existing = baseFriends.find((friend) => friend.id === thread.friend.id);
      const friend: Friend = existing
        ? {
            ...existing,
            name: thread.friend.name,
            username: thread.friend.tag ? `@${thread.friend.tag}` : existing.username,
            avatar: normalizeAvatarUrl(thread.friend.avatar_url) || existing.avatar,
          }
        : mapApiUserToFriend(thread.friend, idx);
      return {
        friend,
        unread: openChat?.friend.id === friend.id ? 0 : Math.max(0, thread.unread || 0),
        messages: thread.last_message ? [mapDirectMessageToChatMessage(thread.last_message)] : [],
      };
    });
    setChatThreads(mappedThreads);
    setOpenChat((prev) => {
      if (!prev) return prev;
      const updated = mappedThreads.find((thread) => thread.friend.id === prev.friend.id);
      if (!updated) return prev;
      return {
        ...updated,
        messages: prev.messages.length ? prev.messages : updated.messages,
        unread: 0,
      };
    });
  };

  const updateThreadPreview = (friendId: number, message: ChatMessage | null, unread: number) => {
    setChatThreads((prev) =>
      prev.map((thread) =>
        thread.friend.id === friendId
          ? {
              ...thread,
              unread: Math.max(0, unread),
              messages: message ? [message] : thread.messages,
            }
          : thread
      )
    );
  };

  const scheduleChatThreadsRefresh = () => {
    if (isDemoMode) return;
    const accessToken = tokenRef.current || token;
    if (!accessToken) return;
    if (chatThreadsRefreshTimerRef.current) {
      clearTimeout(chatThreadsRefreshTimerRef.current);
    }
    chatThreadsRefreshTimerRef.current = setTimeout(() => {
      chatThreadsRefreshTimerRef.current = null;
      void loadChatThreads(accessToken);
    }, 500);
  };

  const markThreadRead = async (friendId: number) => {
    if (isDemoMode) return;
    if (!token) return;
    try {
      await apiRequest<{ ok: boolean; updated: number }>(`/chats/${friendId}/read`, { method: 'POST' }, token);
      scheduleChatThreadsRefresh();
    } catch {
      // noop: optimistic UI already cleared
    }
  };

  const openChatThread = (thread: ChatThread) => {
    setOpenChat({ ...thread, unread: 0 });
    setChatThreads((prev) =>
      prev.map((item) => (item.friend.id === thread.friend.id ? { ...item, unread: 0 } : item))
    );
    void markThreadRead(thread.friend.id);
  };

  const loadProfileData = async (accessToken: string) => {
    const [stats, likes, recent] = await Promise.all([
      apiRequest<ApiProfileStats>('/me/stats', {}, accessToken),
      apiRequest<ApiLikedTrack[]>('/me/likes', {}, accessToken),
      apiRequest<ApiSong[]>('/me/songs', {}, accessToken),
    ]);
    setProfileStats(stats);
    setLikedTrackKeys(new Set(likes.map((item) => item.track_key)));
    setLikedSongs(likes.map((item, idx) => mapLikedTrackToSong(item, idx)));
    setRecentSongs(mergeUniqueSongs(recent.map((item) => mapSessionSongToUiSong(item))));
  };

  const refreshProfileStats = async (accessToken: string) => {
    const stats = await apiRequest<ApiProfileStats>('/me/stats', {}, accessToken);
    setProfileStats(stats);
  };

  const findFriendById = (id: number): Friend | null => friends.find((f) => f.id === id) || null;

  const openFriendProfile = async (friend: Friend) => {
    setFriendProfile(friend);
    setFriendProfileSongs(friend.currentSong ? [friend.currentSong] : []);
    setFriendProfileError('');
    setFriendProfileLoading(true);

    if (isDemoMode) {
      setFriendProfileLoading(false);
      return;
    }

    try {
      const remoteSongs = await apiRequest<ApiSong[]>(`/friends/${friend.id}/songs`, {}, token);
      const mappedSongs = remoteSongs.map((item, idx) => mapFriendSongToUiSong(item, idx, friend.name));
      setFriendProfileSongs(mergeUniqueSongs([...(friend.currentSong ? [friend.currentSong] : []), ...mappedSongs]));
    } catch (err) {
      setFriendProfileError(formatUserFacingError(err, 'Не удалось загрузить треки друга'));
    } finally {
      setFriendProfileLoading(false);
    }
  };

  const addFriendSongToLibrary = async (song: Song): Promise<boolean> => {
    const trackKey = trackKeyOfSong(song);
    if (likedTrackKeys.has(trackKey)) return true;
    return toggleLike(song);
  };

  useEffect(() => {
    if (!friendProfile) return;
    const updated = friends.find((item) => item.id === friendProfile.id);
    if (updated) setFriendProfile(updated);
  }, [friends, friendProfile]);

  useEffect(() => {
    if (!pendingWidgetRequest || !token || !currentUser) return;

    const friend = findFriendById(pendingWidgetRequest.friendId);
    if (!friend) return;
    const targetSong = friend.currentSong && (!pendingWidgetRequest.trackId || friend.currentSong.id === pendingWidgetRequest.trackId)
      ? friend.currentSong
      : friend.currentSong;

    setTab('friends');
    setOpenChat(null);
    setShareModal(null);
    setNpOpen(Boolean(targetSong));
    setListeningWith(targetSong ? friend : null);
    setActiveQueue(null);
    setQueueIndex(null);
    setPlayerError('');

    if (targetSong) {
      selectSongInPlayer(targetSong);
      if (pendingWidgetRequest.autoplay) {
        void startPlayback(targetSong);
      } else {
        audioRef.current?.pause();
        setIsPlaying(false);
      }
    }

    setPendingWidgetRequest(null);
    clearHandledWidgetParams();
  }, [pendingWidgetRequest, token, currentUser, friends, findFriendById, selectSongInPlayer, startPlayback]);

  const toggleLike = async (song: Song): Promise<boolean> => {
    if (!token) return false;
    const trackKey = trackKeyOfSong(song);
    const payload = {
      track_key: trackKey,
      title: song.title,
      artist: song.artist,
      cover_url: song.cover,
      stream_url: song.streamUrl || null,
      source_url: null,
      duration: song.duration || null,
    };
    try {
      const result = await apiRequest<{ liked: boolean }>('/me/likes/toggle', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, token);
      setLikedTrackKeys((prev) => {
        const next = new Set(prev);
        if (result.liked) next.add(trackKey);
        else next.delete(trackKey);
        return next;
      });
      await loadProfileData(token);
      return result.liked;
    } catch (err) {
      setAuthError(formatUserFacingError(err, 'Не удалось поставить лайк'));
      return false;
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!token) return;
    const data = new FormData();
    data.append('file', file);
    try {
      const updated = await apiRequest<ApiUser>('/me/avatar/upload', {
        method: 'POST',
        body: data,
      }, token);
      setCurrentUser({ ...updated, avatar_url: normalizeAvatarUrl(updated.avatar_url) || null });
    } catch (err) {
      throw new Error(formatUserFacingError(err, 'Не удалось загрузить аватар'));
    }
  };

  const updateMyTag = async (nextTag: string) => {
    if (!token || !currentUser) return;
    try {
      const updated = await apiRequest<ApiUser>('/me/tag', {
        method: 'PUT',
        body: JSON.stringify({ tag: nextTag }),
      }, token);
      setCurrentUser((prev) => (prev ? { ...prev, tag: updated.tag } : prev));
    } catch (err) {
      throw new Error(formatUserFacingError(err, 'Не удалось обновить тег'));
    }
  };

  const uploadTrack = async (file: File): Promise<Song> => {
    if (!token) throw new Error('Нет активной сессии');
    const data = new FormData();
    data.append('file', file);
    try {
      const uploaded = await apiRequest<ApiSong>('/songs/upload', {
        method: 'POST',
        body: data,
      }, token);
      const nextSong = mapUploadedSongToUiSong(uploaded, file.name);
      await loadProfileData(token);
      return nextSong;
    } catch (err) {
      throw new Error(formatUserFacingError(err, 'Не удалось загрузить трек'));
    }
  };

  useEffect(() => {
    let cancelled = false;

    const validateToken = async () => {
      if (!token) {
        setAuthReady(true);
        return;
      }
      if (token === DEMO_TOKEN) {
        if (!cancelled) {
          setCurrentUser(DEMO_USER);
          setAuthReady(true);
        }
        return;
      }
      try {
        const me = await apiRequest<ApiMeResponse>('/me', {}, token);
        if (cancelled) return;
        setCurrentUser({
          id: me.id,
          name: me.name,
          email: me.email,
          tag: me.tag,
          avatar_url: normalizeAvatarUrl(me.avatar_url),
        });
      } catch {
        if (cancelled) return;
        clearSession();
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    };

    validateToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !currentUser) return;
    if (isDemoMode) {
      setProfileStats({ friends: FRIENDS.length, tracks: SONGS.length, likes: 2, playlists: 1 });
      setLikedTrackKeys(new Set([trackKeyOfSong(SONGS[0]), trackKeyOfSong(SONGS[1])]));
      setLikedSongs([SONGS[0], SONGS[1]]);
      setRecentSongs([SONGS[2]]);
      return;
    }
    void loadProfileData(token);
  }, [token, currentUser, isDemoMode]);

  useEffect(() => {
    if (!currentUser) return;
    if (!isNativeApp() || getNativePlatform() !== 'android') {
      setDeviceNowPlayingSupported(false);
      setDeviceNowPlayingAccessGranted(false);
      setDeviceNowPlayingTrack(null);
      setDeviceNowPlayingMatch(null);
      setDeviceNowPlayingLoading(false);
      return;
    }

    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async (silent: boolean) => {
      if (stop) return;
      await refreshDeviceNowPlaying({ silent });
      if (stop) return;
      timer = setTimeout(() => {
        void tick(true);
      }, DEVICE_NOW_PLAYING_POLL_INTERVAL_MS);
    };

    void tick(false);

    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!deviceNowPlayingTrack) {
      setDeviceNowPlayingMatch(null);
      setDeviceNowPlayingResolving(false);
      lastResolvedDeviceTrackKeyRef.current = '';
      return;
    }

    const trackKey = `${normalizeMatchText(deviceNowPlayingTrack.title)}::${normalizeMatchText(deviceNowPlayingTrack.artist)}`;
    if (trackKey === lastResolvedDeviceTrackKeyRef.current && deviceNowPlayingMatch) return;

    const localCandidates = mergeUniqueSongs([...likedSongs, ...recentSongs, ...SONGS]);
    const localMatch = pickBestSongMatch(localCandidates, deviceNowPlayingTrack.title, deviceNowPlayingTrack.artist);
    if (localMatch) {
      setDeviceNowPlayingMatch(localMatch);
      setDeviceNowPlayingResolving(false);
      lastResolvedDeviceTrackKeyRef.current = trackKey;
      return;
    }

    let cancelled = false;
    setDeviceNowPlayingResolving(true);
    setDeviceNowPlayingMatch(null);

    const resolveRemotely = async () => {
      try {
        const query = [deviceNowPlayingTrack.title, deviceNowPlayingTrack.artist].filter(Boolean).join(' ');
        const results = await apiRequest<ApiMusicSearchItem[]>(
          `/music/search?q=${encodeURIComponent(query)}&limit=8`,
          {}
        );
        if (cancelled) return;
        const remoteSongs = results.map((item, idx) => mapMusicSearchItemToSong(item, idx));
        setDeviceNowPlayingMatch(pickBestSongMatch(remoteSongs, deviceNowPlayingTrack.title, deviceNowPlayingTrack.artist, 60));
        lastResolvedDeviceTrackKeyRef.current = trackKey;
      } catch {
        if (!cancelled) setDeviceNowPlayingMatch(null);
      } finally {
        if (!cancelled) setDeviceNowPlayingResolving(false);
      }
    };

    void resolveRemotely();

    return () => {
      cancelled = true;
    };
  }, [deviceNowPlayingTrack, likedSongs, recentSongs, deviceNowPlayingMatch]);

  useEffect(() => {
    if (!token || !currentUser) return;
    if (isDemoMode) {
      setFriends(FRIENDS);
      setChatThreads(CHAT_THREADS);
      return;
    }

    let stop = false;

    const clearScheduledRefresh = () => {
      if (friendsPollTimerRef.current) {
        clearTimeout(friendsPollTimerRef.current);
        friendsPollTimerRef.current = null;
      }
    };

    const getNextDelay = () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible'
        ? FRIENDS_POLL_INTERVAL_MS
        : FRIENDS_POLL_HIDDEN_INTERVAL_MS;

    const scheduleNext = () => {
      if (stop) return;
      clearScheduledRefresh();
      friendsPollTimerRef.current = setTimeout(() => {
        void refreshFriends(true);
      }, getNextDelay());
    };

    const refreshFriends = async (silent: boolean) => {
      if (friendsLoadInFlightRef.current) {
        scheduleNext();
        return;
      }
      friendsLoadInFlightRef.current = true;
      try {
        await loadFriends(token, { silent });
      } catch {
        // noop: keep stale friend state until next poll
      } finally {
        friendsLoadInFlightRef.current = false;
        scheduleNext();
      }
    };

    const refreshSoonIfActive = () => {
      if (stop) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      clearScheduledRefresh();
      void refreshFriends(true);
    };

    void refreshFriends(false);
    window.addEventListener('focus', refreshSoonIfActive);
    document.addEventListener('visibilitychange', refreshSoonIfActive);

    return () => {
      stop = true;
      clearScheduledRefresh();
      window.removeEventListener('focus', refreshSoonIfActive);
      document.removeEventListener('visibilitychange', refreshSoonIfActive);
    };
  }, [token, currentUser, isDemoMode]);

  useEffect(() => {
    if (!currentUser) return;
    void publishFriendsWidgetSnapshot(friends, currentUser.name).catch(() => undefined);
  }, [friends, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const timer = window.setInterval(() => {
      void publishFriendsWidgetSnapshot(friendsRef.current, currentUser.name).catch(() => undefined);
    }, WIDGET_SNAPSHOT_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!token || !currentUser) return;
    if (isDemoMode) return;
    let stop = false;
    const tick = async () => {
      try {
        await loadChatThreads(token);
      } catch {
        // noop
      }
      if (!stop) setTimeout(tick, 3500);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [token, currentUser, isDemoMode]);

  useEffect(() => {
    if (!token || !currentUser) return;
    if (isDemoMode) return;
    let stop = false;
    const poll = async () => {
      try {
        const invites = await apiRequest<ApiSession[]>('/listen/incoming', {}, token);
        for (const invite of invites) {
          if (handledInviteIdsRef.current.has(invite.id)) continue;
          handledInviteIdsRef.current.add(invite.id);
          const host = findFriendById(invite.host_id);
          const hostLabel = host ? host.name : `#${invite.host_id}`;
          const ok = window.confirm(`${hostLabel} приглашает вас к совместному прослушиванию. Принять?`);
          if (ok) {
            await acceptInvite(invite.id);
          }
        }
      } catch {
        // noop
      }
      if (!stop) setTimeout(poll, SESSION_POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [token, currentUser, friends, isDemoMode]);

  useEffect(() => {
    if (!token || !currentUser) return;
    if (isDemoMode) return;
    let stop = false;
    const tick = async () => {
      let nextDelay = SESSION_POLL_INTERVAL_MS;
      try {
        const session = await apiRequest<ApiSession | null>('/listen/active', {}, token);
        setActiveSession(session);
        if (session) nextDelay = 800;
        if (!session) {
          setListeningWith(null);
          setSessionMessages([]);
          lastMessageIdRef.current = 0;
          lastAppliedSessionSongIdRef.current = null;
          lastAutoOpenedSessionIdRef.current = null;
          setCurrentBackendSongId(null);
        }
        if (session && session.song) {
          setCurrentBackendSongId(session.song.id);
          const mateId = session.host_id === currentUser.id ? session.guest_id : session.host_id;
          const mate = findFriendById(mateId);
          if (mate) setListeningWith(mate);
          if (lastAutoOpenedSessionIdRef.current !== session.id) {
            setNpOpen(true);
            lastAutoOpenedSessionIdRef.current = session.id;
          }
          if (suppressSessionSyncRef.current) {
            if (!stop) setTimeout(tick, nextDelay);
            return;
          }
          const audio = audioRef.current;
          if (!audio) {
            if (!stop) setTimeout(tick, nextDelay);
            return;
          }
          const incomingSongId = session.song.id;
          const songChanged = lastAppliedSessionSongIdRef.current !== incomingSongId;
          const target = getSessionTargetSec(session);
          if (songChanged) {
            suppressSessionSyncRef.current = true;
            const sessionSong = mapSessionSongToUiSong(session.song);
            setActiveQueue(null);
            setQueueIndex(null);
            setCustomSong(sessionSong);
            await startPlayback(sessionSong);
            audio.currentTime = target;
            setCurrentTimeSec(target);
            if (!session.is_playing) {
              audio.pause();
              setIsPlaying(false);
            } else if (audio.paused) {
              await audio.play().catch(() => undefined);
              setIsPlaying(true);
            }
            lastAppliedSessionSongIdRef.current = incomingSongId;
            setTimeout(() => {
              suppressSessionSyncRef.current = false;
            }, 800);
          } else {
            const isHost = session.host_id === currentUser.id;
            if (!isHost) {
              const drift = Math.abs((audio.currentTime || 0) - target);
              if (drift > 1.2) {
                audio.currentTime = target;
                setCurrentTimeSec(target);
              }
            }
            if (session.is_playing && audio.paused) {
              await audio.play().catch(() => undefined);
              setIsPlaying(true);
            }
            if (!session.is_playing && !audio.paused) {
              audio.pause();
              setIsPlaying(false);
            }
          }
        }
      } catch {
        // noop
      }
      if (!stop) setTimeout(tick, nextDelay);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [token, currentUser, friends, isDemoMode]);

  useEffect(() => {
    if (!token || !activeSession) return;
    if (isDemoMode) return;
    let stop = false;
    const pollMsgs = async () => {
      try {
        const msgs = await apiRequest<ApiSessionMessage[]>(
          `/listen/${activeSession.id}/messages?after_id=${lastMessageIdRef.current}`,
          {},
          token
        );
        if (msgs.length) {
          setSessionMessages((prev) => [...prev, ...msgs]);
          lastMessageIdRef.current = msgs[msgs.length - 1].id;
        }
      } catch {
        // noop
      }
      if (!stop) setTimeout(pollMsgs, 1600);
    };
    void pollMsgs();
    return () => {
      stop = true;
    };
  }, [token, activeSession, isDemoMode]);

  useEffect(() => {
    if (!token || !activeSession || suppressSessionSyncRef.current || !currentUser) return;
    if (isDemoMode) return;
    const isHost = activeSession.host_id === currentUser.id;
    if (!isHost) return;
    const timer = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      void apiRequest<ApiSession>(`/listen/${activeSession.id}/state`, {
        method: 'PUT',
        body: JSON.stringify({
          song_id: currentBackendSongId ?? activeSession.song?.id ?? null,
          position_sec: Math.floor(audio.currentTime || 0),
          is_playing: !audio.paused,
        }),
      }, token).catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [token, activeSession, currentUser, currentBackendSongId, isDemoMode]);

  const submitAuth = async (mode: AuthMode, email: string, password: string, name?: string) => {
    setAuthError('');
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login'
        ? { email, password }
        : { email, password, name: name?.trim() || undefined };
      const auth = await apiRequest<ApiTokenResponse>(path, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      localStorage.setItem(AUTH_STORAGE_KEY, auth.access_token);
      localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
      setShowOnboarding(false);
      setToken(auth.access_token);
      setCurrentUser({ ...auth.user, avatar_url: normalizeAvatarUrl(auth.user.avatar_url) || null });
    } catch (err) {
      setAuthError(formatAuthError(err));
    }
  };

  const addFriend = async (friendName: string) => {
    if (isDemoMode) {
      setAuthError('Это демо-режим: добавление друзей доступно после входа.');
      return;
    }
    if (!token || !friendName.trim()) return;
    try {
      await apiRequest<ApiUser>('/friends', {
        method: 'POST',
        body: JSON.stringify({ friend_name: friendName.trim() }),
      }, token);
      await loadFriends(token);
      await refreshProfileStats(token);
    } catch (err) {
      setAuthError(formatUserFacingError(err, 'Не удалось добавить друга'));
    }
  };

  const searchUsers = async (query: string): Promise<ApiUser[]> => {
    if (isDemoMode) return [];
    if (!token) return [];
    return apiRequest<ApiUser[]>(`/users/search?q=${encodeURIComponent(query)}`, {}, token);
  };

  const syncNowPlayingToBackend = async (song: Song): Promise<ApiSong | null> => {
    if (isDemoMode) return null;
    if (!token) return null;
    try {
      const songUrl = resolveStreamUrl(song) || `${window.location.origin}/tracks/${song.id}-${song.title.toLowerCase().replace(/\s+/g, '-')}`;
      const created = await apiRequest<ApiSong>('/songs', {
        method: 'POST',
        body: JSON.stringify({
          url: songUrl,
          title: song.title,
          artist: song.artist,
          cover_url: song.cover,
          stream_url: resolveStreamUrl(song) || null,
          duration: song.duration,
        }),
      }, token);
      await apiRequest<ApiSong>('/me/now-playing', {
        method: 'PUT',
        body: JSON.stringify({ song_id: created.id }),
      }, token);
      await refreshProfileStats(token);
      setCurrentBackendSongId(created.id);
      return created;
    } catch (err) {
      console.warn('Failed to sync now playing to backend.', err);
      return null;
    }
  };

  const inviteToListen = async (
    friendId: number,
    songId: number | null,
    positionSec: number,
    isPlayingNow: boolean,
    asGuest: boolean = false
  ) => {
    if (isDemoMode) return;
    if (!token) return;
    try {
      const session = await apiRequest<ApiSession>('/listen/invite', {
        method: 'POST',
        body: JSON.stringify({
          friend_id: friendId,
          song_id: songId,
          position_sec: Math.max(0, Math.floor(positionSec)),
          is_playing: isPlayingNow,
          as_guest: asGuest,
        }),
      }, token);
      setActiveSession(session);
      setCurrentBackendSongId(session.song?.id ?? songId ?? null);
      setSessionMessages([]);
      lastMessageIdRef.current = 0;
    } catch (err) {
      console.warn('Failed to invite listen session', err);
    }
  };

  const acceptInvite = async (sessionId: number) => {
    if (isDemoMode) return;
    if (!token) return;
    const accepted = await apiRequest<ApiSession>(`/listen/${sessionId}/accept`, { method: 'POST' }, token);
    setActiveSession(accepted);
    setCurrentBackendSongId(accepted.song?.id ?? null);
    setSessionMessages([]);
    lastMessageIdRef.current = 0;
    lastAutoOpenedSessionIdRef.current = accepted.id;
    if (accepted.song) {
      const mateId = currentUser && accepted.host_id === currentUser.id ? accepted.guest_id : accepted.host_id;
      const mate = findFriendById(mateId);
      if (mate) setListeningWith(mate);
      setNpOpen(true);
      const sessionSong = mapSessionSongToUiSong(accepted.song);
      setActiveQueue(null);
      setQueueIndex(null);
      setCustomSong(sessionSong);
      const audio = audioRef.current;
      if (audio) {
        await startPlayback(sessionSong);
        const target = getSessionTargetSec(accepted);
        audio.currentTime = target;
        setCurrentTimeSec(target);
        if (!accepted.is_playing) {
          audio.pause();
          setIsPlaying(false);
        }
      }
      lastAppliedSessionSongIdRef.current = accepted.song.id;
    }
  };

  const sendSessionMessage = async (text: string) => {
    if (isDemoMode) return;
    if (!token || !activeSession) return;
    try {
      const msg = await apiRequest<ApiSessionMessage>(`/listen/${activeSession.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }, token);
      setSessionMessages((prev) => [...prev, msg]);
      lastMessageIdRef.current = Math.max(lastMessageIdRef.current, msg.id);
    } catch (err) {
      setAuthError(formatUserFacingError(err, 'Не удалось отправить сообщение'));
    }
  };

  const leaveSession = async () => {
    if (isDemoMode) return;
    if (!token || !activeSession) return;
    try {
      await apiRequest<ApiSession>(`/listen/${activeSession.id}/end`, { method: 'POST' }, token);
    } catch {
      // noop
    } finally {
      setActiveSession(null);
      setListeningWith(null);
      setNpOpen(false);
      setSessionMessages([]);
      lastMessageIdRef.current = 0;
      lastAutoOpenedSessionIdRef.current = null;
      setCurrentBackendSongId(null);
      setActiveQueue(null);
      setQueueIndex(null);
    }
  };

  const sendSongToFriendChat = async (friend: Friend, song: Song) => {
    if (!token) return;
    if (isDemoMode) {
      const next: ChatMessage = {
        id: Date.now(),
        senderId: currentUser?.id ?? 0,
        text: `🎵 ${song.title}`,
        time: 'Сейчас',
        songShare: song,
      };
      updateThreadPreview(friend.id, next, 0);
      return;
    }
    try {
      await apiRequest<ApiDirectMessage>(
        `/chats/${friend.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: `🎵 ${song.title}`,
            song: {
              title: song.title,
              artist: song.artist,
              cover_url: song.cover,
              stream_url: song.streamUrl || null,
              duration: song.duration || null,
            },
          }),
        },
        token
      );
      await loadChatThreads(token);
    } catch (err) {
      throw new Error(formatUserFacingError(err, 'Не удалось отправить трек в чат'));
    }
  };

  const playSong = (song: Song, friend?: Friend, queue?: Song[], selectedIndex?: number) => {
    if (queue && queue.length > 0) {
      const resolvedIdx = typeof selectedIndex === 'number'
        ? selectedIndex
        : Math.max(0, queue.findIndex((s) => s.id === song.id));
      setActiveQueue(queue);
      setQueueIndex(Math.max(0, resolvedIdx));
    } else {
      setActiveQueue(null);
      setQueueIndex(null);
    }
    selectSongInPlayer(song);
    setIsPlaying(true);
    setListeningWith(friend ?? null);
    if (friend) setNpOpen(true);
    void startPlayback(song);
    void (async () => {
      const created = await syncNowPlayingToBackend(song);
      if (created?.id) setCurrentBackendSongId(created.id);
      if (friend) {
        const currentPos = audioRef.current?.currentTime || 0;
        await inviteToListen(friend.id, created?.id ?? null, currentPos, true, true);
      }
    })();
  };

  if (!authReady) {
    return <div className="auth-loading">Проверяем сессию...</div>;
  }

  if (!token || !currentUser) {
    if (showOnboarding) {
      return <OnboardingScreen onContinue={completeOnboarding} onDemo={enterDemoMode} />;
    }
    return (
      <AuthScreen
        error={authError}
        onSubmit={submitAuth}
        onStartSocialAuth={startSocialAuth}
        onDemo={enterDemoMode}
      />
    );
  }

  return (
    <>
      <AppHeader tab={tab} currentUser={currentUser} onLogout={clearSession} />

      <motion.div
        className="screen-scroll"
        key={tab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
      >
        {tab === 'friends' && (
          <FriendsScreen
            friends={friends}
            loading={isLoadingData}
            onAddFriend={addFriend}
            onSearchUsers={searchUsers}
            onPlay={playSong}
            onEnqueue={enqueueSong}
            onShare={(s) => setShareModal(s)}
            onOpenProfile={(friend) => void openFriendProfile(friend)}
          />
        )}
        {tab === 'discover' && (
          <DiscoverScreen
            token={token}
            isDemoMode={isDemoMode}
            deviceNowPlayingSupported={deviceNowPlayingSupported}
            deviceNowPlayingAccessGranted={deviceNowPlayingAccessGranted}
            deviceNowPlayingTrack={deviceNowPlayingTrack}
            deviceNowPlayingMatch={deviceNowPlayingMatch}
            deviceNowPlayingLoading={deviceNowPlayingLoading}
            deviceNowPlayingResolving={deviceNowPlayingResolving}
            deviceNowPlayingError={deviceNowPlayingError}
            onOpenDeviceAccessSettings={() => void openDeviceAccessSettings()}
            onRefreshDeviceNowPlaying={() => void refreshDeviceNowPlaying()}
            onPlay={(s, queue, index) => playSong(s, undefined, queue, index)}
            onEnqueue={enqueueSong}
            onShare={(s) => setShareModal(s)}
          />
        )}
        {tab === 'chat' && <ChatListScreen threads={chatThreads} onOpenChat={openChatThread} />}
        {tab === 'profile' && (
          <ProfileScreen
            currentUser={currentUser}
            stats={profileStats}
            likedSongs={likedSongs}
            recentSongs={recentSongs}
            likedTrackKeys={likedTrackKeys}
            onToggleLike={toggleLike}
            onUploadAvatar={uploadAvatar}
            onUploadTrack={uploadTrack}
            onUpdateTag={updateMyTag}
            onPlay={(s) => playSong(s)}
          />
        )}
      </motion.div>

      <div className="mini-player-area">
        <motion.div className="mini-player" onClick={() => setNpOpen(true)} whileTap={{ scale: 0.97 }}>
          <img src={currentSong.cover} alt="" />
          <div className="mp-info">
            <h4>{currentSong.title}</h4>
            <p>{currentSong.artist}{listeningWith ? ` · с ${listeningWith.name}` : ''}</p>
          </div>
          <div className="mp-controls">
            <button className="mp-btn" onClick={(e) => { e.stopPropagation(); toggle(); }}>
              {isPlaying ? <Pause size={18} /> : <Play size={18} fill="#fff" />}
            </button>
            <button className="mp-btn play" onClick={(e) => { e.stopPropagation(); next(); }}>
              <SkipForward size={18} fill="#fff" />
            </button>
          </div>
        </motion.div>
        {playerError && <div className="player-error">{playerError}</div>}
      </div>

      <BottomNav tab={tab} onChangeTab={setTab} />

      <AnimatePresence>
        {npOpen && (
          <NowPlayingFull
            song={currentSong}
            isPlaying={isPlaying}
            currentTimeSec={currentTimeSec}
            durationSec={durationSec}
            isLiked={likedTrackKeys.has(trackKeyOfSong(currentSong))}
            shuffleOn={shuffleOn}
            repeatMode={repeatMode}
            queue={activeQueue}
            queueIndex={queueIndex}
            listeningWith={listeningWith}
            onClose={() => setNpOpen(false)}
            onToggle={toggle}
            onNext={next}
            onPrev={prev}
            onSeek={seekTo}
            onToggleLike={() => toggleLike(currentSong)}
            onToggleShuffle={toggleShuffle}
            onCycleRepeat={cycleRepeat}
            onQueueSelect={playFromQueue}
            onQueueRemove={removeFromQueue}
            token={token}
            currentUserId={currentUser.id}
            sessionActive={Boolean(activeSession)}
            sessionId={activeSession?.id ?? null}
            sessionMessages={sessionMessages}
            onSendSessionMessage={sendSessionMessage}
            onLeaveSession={leaveSession}
            onShare={() => setShareModal(currentSong)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openChat && (
          <ChatDetail
            thread={openChat}
            token={token}
            currentUserId={currentUser.id}
            onClose={() => setOpenChat(null)}
            onPlay={(s) => {
              setOpenChat(null);
              playSong(s);
              setNpOpen(true);
            }}
            onThreadActivity={(friendId, lastMessage, unread) => updateThreadPreview(friendId, lastMessage, unread)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shareModal && (
          <ShareModal
            song={shareModal}
            friends={friends}
            onClose={() => setShareModal(null)}
            onSendToFriend={sendSongToFriendChat}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {friendProfile && (
          <FriendProfileModal
            friend={friendProfile}
            songs={friendProfileSongs}
            loading={friendProfileLoading}
            error={friendProfileError}
            likedTrackKeys={likedTrackKeys}
            onClose={() => {
              setFriendProfile(null);
              setFriendProfileSongs([]);
              setFriendProfileError('');
            }}
            onPlay={(song) => {
              setFriendProfile(null);
              playSong(song, friendProfile);
            }}
            onAddSong={addFriendSongToLibrary}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ========== HEADER ========== */
function AppHeader({ tab, currentUser, onLogout }: { tab: Tab; currentUser: ApiUser; onLogout: () => void }) {
  const titles: Record<Tab, string> = { friends: 'Друзья', discover: 'Открытия', chat: 'Чаты', profile: 'Профиль' };
  return (
    <header className="app-header">
      <h1 className="header-title">
        {tab === 'friends' ? (
          <img src="/logo.png" alt="MATCH" className="header-logo" />
        ) : (
          <span className="accent">{titles[tab]}</span>
        )}
      </h1>
      <div className="header-actions">
        <button className="icon-btn" title={currentUser.name}><Bell size={20} /></button>
        <button className="icon-btn" onClick={onLogout} title="Выйти"><LogOut size={20} /></button>
      </div>
    </header>
  );
}

/* ========== ONBOARDING ========== */
function OnboardingScreen({ onContinue, onDemo }: { onContinue: () => void; onDemo: () => void }) {
  const slides = [
    {
      title: 'Это Match',
      text: 'Социальный музыкальный сервис, где можно слушать вместе и знакомиться по вкусу.',
    },
    {
      title: 'Слушайте синхронно',
      text: 'Подключайтесь к эфиру друга, трек и время воспроизведения синхронизируются.',
    },
    {
      title: 'Общайтесь в моменте',
      text: 'Пишите в чат, делитесь треками и тестируйте функции без регистрации в демо-режиме.',
    },
  ];
  const [step, setStep] = useState(0);
  const isLast = step === slides.length - 1;

  return (
    <div className="onboarding-shell">
      <motion.div
        className="onboarding-card glass-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <img src="/logo.png" alt="MATCH" className="auth-logo" />
        <div className="onboarding-progress">
          {slides.map((_, idx) => (
            <span key={idx} className={`dot ${idx === step ? 'active' : ''}`} />
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.2 }}
          >
            <h2>{slides[step].title}</h2>
            <p>{slides[step].text}</p>
          </motion.div>
        </AnimatePresence>

        <div className="onboarding-actions">
          {!isLast && (
            <button className="auth-submit" onClick={() => setStep((prev) => Math.min(slides.length - 1, prev + 1))}>
              Далее
            </button>
          )}
          {isLast && (
            <>
              <button className="auth-submit" onClick={onContinue}>
                Войти / Регистрация
              </button>
              <button className="auth-submit" type="button" onClick={onDemo}>
                Открыть тестовую версию
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ========== AUTH ========== */
function AuthScreen({
  onSubmit,
  onStartSocialAuth,
  onDemo,
  error,
}: {
  onSubmit: (mode: AuthMode, email: string, password: string, name?: string) => Promise<void>;
  onStartSocialAuth: (provider: SocialProvider) => void;
  onDemo: () => void;
  error: string;
}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const emailTrimmed = email.trim();
    if (!emailTrimmed || !password || submitting) return;
    if (mode === 'register' && !name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(mode, emailTrimmed, password, name.trim() || undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <motion.div
        className="auth-card glass-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <img src="/logo.png" alt="MATCH" className="auth-logo" />
        <h2>{mode === 'login' ? 'Вход' : 'Регистрация'}</h2>
        <p>Войдите по почте, Google или Яндекс ID</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Вход</button>
          <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>Регистрация</button>
        </div>

        <div className="auth-form">
          {mode === 'register' && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя в приложении"
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            autoComplete="email"
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          />
          <button className="auth-submit" onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Подключение...' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
          <button className="auth-submit" type="button" onClick={onDemo} disabled={submitting}>
            Демо-режим без входа
          </button>
        </div>
        <div className="auth-divider"><span>или войти через</span></div>
        <div className="auth-socials">
          <button
            className="auth-social-btn google"
            type="button"
            onClick={() => onStartSocialAuth('google')}
            disabled={submitting}
            aria-label="Войти через Google"
            title="Google"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22 12.24c0-.76-.07-1.49-.2-2.2H12v4.15h5.6a4.8 4.8 0 0 1-2.08 3.15v2.62h3.37c1.97-1.81 3.11-4.48 3.11-7.72Z" fill="#4285F4" />
              <path d="M12 22c2.81 0 5.17-.93 6.89-2.52l-3.37-2.62c-.93.63-2.13 1-3.52 1-2.7 0-4.99-1.82-5.81-4.26H2.7v2.71A10 10 0 0 0 12 22Z" fill="#34A853" />
              <path d="M6.19 13.6A6 6 0 0 1 5.86 12c0-.56.12-1.1.33-1.6V7.68H2.7A10 10 0 0 0 2 12c0 1.62.39 3.16 1.09 4.4l3.1-2.8Z" fill="#FBBC04" />
              <path d="M12 6.14c1.53 0 2.9.53 3.98 1.55l2.98-2.98A10 10 0 0 0 12 2a10 10 0 0 0-9.3 5.68l3.49 2.72c.82-2.44 3.11-4.26 5.81-4.26Z" fill="#EA4335" />
            </svg>
          </button>
          <button
            className="auth-social-btn yandex"
            type="button"
            onClick={() => onStartSocialAuth('yandex')}
            disabled={submitting}
            aria-label="Войти через Яндекс ID"
            title="Яндекс ID"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="0" y="0" width="24" height="24" rx="7" fill="#FC3F1D" />
              <path d="M13.73 6h-2.28c-2.42 0-4.1 1.39-4.1 3.52 0 1.52.84 2.64 2.47 3.34l-2.7 5.14h2.5l2.57-4.93h.12V18H15V6h-1.27Zm-1.54 5.1c-1.37 0-2.1-.63-2.1-1.66 0-.97.72-1.58 2.03-1.58h.66v3.24h-.59Z" fill="#fff" />
            </svg>
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}
      </motion.div>
    </div>
  );
}

/* ========== SHARE MODAL ========== */
function ShareModal({
  song,
  friends,
  onClose,
  onSendToFriend,
}: {
  song: Song;
  friends: Friend[];
  onClose: () => void;
  onSendToFriend: (friend: Friend, song: Song) => Promise<void>;
}) {
  const [sendingFriendId, setSendingFriendId] = useState<number | null>(null);

  const handleShare = async (friend: Friend) => {
    if (sendingFriendId !== null) return;
    setSendingFriendId(friend.id);
    try {
      await onSendToFriend(friend, song);
      onClose();
    } catch (err) {
      alert(formatUserFacingError(err, 'Не удалось отправить трек'));
    } finally {
      setSendingFriendId(null);
    }
  };

  const handleCopy = async () => {
    const text = `🎵 Послушай "${song.title}" — ${song.artist}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: song.title, text, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(text);
        alert('Скопировано в буфер! 📋');
      }
    } catch {}
    onClose();
  };

  return (
    <motion.div className="share-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div className="share-sheet glass-panel"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', bounce: 0.12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="share-header">
          <h3>Поделиться треком</h3>
          <button className="icon-btn glass-btn-sm" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="share-song-preview glass-inset">
          <img src={song.cover} alt="" />
          <div>
            <h4>{song.title}</h4>
            <p>{song.artist}</p>
          </div>
        </div>

        <p className="share-label">Отправить другу</p>
        <div className="share-friends-list">
          {friends.map(f => (
            <motion.div key={f.id} className="share-friend-item"
              whileTap={{ scale: 0.97 }}
              onClick={() => handleShare(f)}
            >
              <img src={f.avatar} alt="" />
              <span>{f.name}</span>
              <Send size={16} className="share-send-icon" />
            </motion.div>
          ))}
        </div>

        <motion.button className="share-copy-btn glass-btn" whileTap={{ scale: 0.97 }} onClick={handleCopy}>
          <Share2 size={18} /> Копировать ссылку
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

function FriendProfileModal({
  friend,
  songs,
  loading,
  error,
  likedTrackKeys,
  onClose,
  onPlay,
  onAddSong,
}: {
  friend: Friend;
  songs: Song[];
  loading: boolean;
  error: string;
  likedTrackKeys: Set<string>;
  onClose: () => void;
  onPlay: (song: Song) => void;
  onAddSong: (song: Song) => Promise<boolean>;
}) {
  const [savingTrackKey, setSavingTrackKey] = useState<string | null>(null);

  const handleAddSong = async (song: Song) => {
    const trackKey = trackKeyOfSong(song);
    if (savingTrackKey || likedTrackKeys.has(trackKey)) return;
    setSavingTrackKey(trackKey);
    try {
      await onAddSong(song);
    } catch (err) {
      alert(formatUserFacingError(err, 'Не удалось добавить трек'));
    } finally {
      setSavingTrackKey(null);
    }
  };

  return (
    <motion.div
      className="share-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="share-sheet friend-profile-sheet glass-panel"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', bounce: 0.12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="share-header">
          <h3>Профиль друга</h3>
          <button className="icon-btn glass-btn-sm" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="friend-profile-hero glass-inset">
          <img src={friend.avatar} alt={friend.name} />
          <div className="friend-profile-meta">
            <h3>{friend.name}</h3>
            <p>{friend.username}</p>
            <p>{friend.isListening ? 'Сейчас слушает музыку' : friend.lastActive || 'Недавно был в сети'}</p>
            {friend.currentSong && (
              <div className="friend-profile-actions">
                <button className="profile-avatar-btn" onClick={() => onPlay(friend.currentSong!)}>
                  Слушать текущий трек
                </button>
              </div>
            )}
          </div>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {loading && <div className="search-status">Загружаем треки друга...</div>}
        {!loading && songs.length === 0 && <div className="search-status">У этого друга пока нет доступных треков</div>}

        {songs.length > 0 && (
          <>
            <div className="section-header friend-profile-section-header">
              <h3 className="section-title">Треки друга</h3>
            </div>
            {songs.map((song) => {
              const trackKey = trackKeyOfSong(song);
              const saved = likedTrackKeys.has(trackKey);
              const saving = savingTrackKey === trackKey;
              return (
                <div className="trending-item friend-profile-track" key={trackKey}>
                  <img src={song.cover} alt="" onClick={() => onPlay(song)} />
                  <div className="trending-info" onClick={() => onPlay(song)}>
                    <h4>{song.title}</h4>
                    <p>{song.artist} · {song.duration}</p>
                  </div>
                  <button
                    className="profile-avatar-btn friend-save-btn"
                    onClick={() => void handleAddSong(song)}
                    disabled={saved || saving}
                  >
                    {saving ? 'Добавляем...' : saved ? 'Уже у вас' : 'Добавить себе'}
                  </button>
                  <button className="play-btn-sm" onClick={() => onPlay(song)}>
                    <Play size={14} fill="#fff" />
                  </button>
                </div>
              );
            })}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ========== FRIENDS SCREEN ========== */
function FriendsScreen({
  friends,
  loading,
  onAddFriend,
  onSearchUsers,
  onPlay,
  onEnqueue,
  onShare,
  onOpenProfile,
}: {
  friends: Friend[];
  loading: boolean;
  onAddFriend: (name: string) => Promise<void>;
  onSearchUsers: (query: string) => Promise<ApiUser[]>;
  onPlay: (s: Song, f?: Friend) => void;
  onEnqueue: (song: Song) => void;
  onShare: (s: Song) => void;
  onOpenProfile: (friend: Friend) => void;
}) {
  const [friendName, setFriendName] = useState('');
  const [suggestions, setSuggestions] = useState<ApiUser[]>([]);
  const [searching, setSearching] = useState(false);
  const friendInputRef = useRef<HTMLInputElement | null>(null);

  const submitAddFriend = async () => {
    const trimmed = friendName.trim();
    if (!trimmed || !trimmed.startsWith('@')) return;
    await onAddFriend(trimmed);
    setFriendName('');
    setSuggestions([]);
  };

  const openAddFriendsCta = () => {
    if (!friendName.trim()) setFriendName('@');
    requestAnimationFrame(() => {
      friendInputRef.current?.focus();
      const valueLength = friendInputRef.current?.value.length ?? 0;
      friendInputRef.current?.setSelectionRange(valueLength, valueLength);
    });
  };

  useEffect(() => {
    const trimmed = friendName.trim();
    if (!trimmed.startsWith('@') || trimmed.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await onSearchUsers(trimmed.slice(1));
        if (!cancelled) setSuggestions(found);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [friendName]);

  return (
    <>
      <div className="add-friend-row glass-inset">
        <input
          ref={friendInputRef}
          placeholder="Добавить друга по @тегу"
          value={friendName}
          onChange={(e) => setFriendName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submitAddFriend(); }}
        />
        <button className="add-friend-btn" onClick={() => void submitAddFriend()} disabled={!friendName.trim().startsWith('@')}>Добавить</button>
      </div>
      {(searching || suggestions.length > 0) && (
        <div className="friend-suggest-list glass-inset">
          {searching && <div className="friend-suggest-item">Ищем пользователей...</div>}
          {!searching && suggestions.map((u) => (
            <div className="friend-suggest-item" key={u.id}>
              <div>
                <div className="friend-suggest-name">{u.name}</div>
                <div className="friend-suggest-tag">@{u.tag}</div>
              </div>
              <button
                className="add-friend-btn"
                onClick={() => {
                  if (!u.tag) return;
                  setFriendName(`@${u.tag}`);
                  void onAddFriend(`@${u.tag}`);
                  setSuggestions([]);
                }}
              >
                Добавить
              </button>
            </div>
          ))}
          {!searching && suggestions.length === 0 && friendName.trim().startsWith('@') && (
            <div className="friend-suggest-item">Ничего не найдено</div>
          )}
        </div>
      )}

      <div className="stories-row">
        <div className="story-item">
          <div className="story-ring inactive" style={{ position: 'relative' }}>
            <img src="/avatars/user.jpg" alt="Вы" />
            <div className="story-add-btn"><Plus size={12} strokeWidth={3} /></div>
          </div>
          <span className="story-name">Вы</span>
        </div>
        {friends.map(f => (
          <div className="story-item" key={f.id} onClick={() => onOpenProfile(f)}>
            <div className={`story-ring ${f.isListening ? '' : 'inactive'}`}>
              <img src={f.avatar} alt={f.name} />
            </div>
            <span className="story-name">{f.name.split(' ')[0]}</span>
          </div>
        ))}
        <button
          type="button"
          className="story-item story-item-cta"
          onClick={openAddFriendsCta}
          aria-label="Найти и добавить друзей"
        >
          <div className="story-ring story-cta-ring">
            <div className="story-cta-icon"><Plus size={18} strokeWidth={2.6} /></div>
          </div>
          <span className="story-name">Найти друзей</span>
        </button>
      </div>

      {!loading && friends.length === 0 && (
        <div className="empty-friends">Список друзей пока пуст. Добавьте друга по имени выше.</div>
      )}

      {friends.filter(f => f.currentSong).map((friend, i) => (
        <motion.div className="widget-card glass-card" key={friend.id}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, type: 'spring', bounce: 0.25 }}
        >
          <div className="widget-user friend-profile-trigger" onClick={() => onOpenProfile(friend)}>
            <div className="widget-avatar-wrap">
              <img src={friend.avatar} alt="" className="widget-avatar" onClick={() => onOpenProfile(friend)} />
              {friend.isOnline && <div className={`online-dot ${friend.isListening ? 'listening' : ''}`} />}
            </div>
            <div className="widget-user-info" onClick={() => onOpenProfile(friend)}>
              <h3>{friend.name}</h3>
              <p>{friend.isListening ? 'Слушает сейчас' : friend.lastActive}</p>
            </div>
            {friend.isListening && (
              <div className="listening-badge">
                <div className="eq-bars"><div className="eq-bar"/><div className="eq-bar"/><div className="eq-bar"/></div>
                В ЭФИРЕ
              </div>
            )}
          </div>
          {friend.currentSong && (
            <div className="song-row-wrap">
              <div className="song-row" onClick={() => onPlay(friend.currentSong!, friend)}>
                <img src={friend.currentSong.cover} alt="" />
                <div className="song-row-info">
                  <h4>{friend.currentSong.title}</h4>
                  <p>{friend.currentSong.artist}</p>
                </div>
                <button className="play-btn-sm"><Play size={14} fill="#fff" /></button>
              </div>
              <button className="share-inline-btn" onClick={() => onEnqueue(friend.currentSong!)} title="Добавить в очередь">
                <Plus size={14} />
              </button>
              <button className="share-inline-btn" onClick={() => onShare(friend.currentSong!)}>
                <Share2 size={14} />
              </button>
            </div>
          )}
        </motion.div>
      ))}
    </>
  );
}

/* ========== DISCOVER ========== */
function DiscoverScreen({
  token,
  isDemoMode,
  deviceNowPlayingSupported,
  deviceNowPlayingAccessGranted,
  deviceNowPlayingTrack,
  deviceNowPlayingMatch,
  deviceNowPlayingLoading,
  deviceNowPlayingResolving,
  deviceNowPlayingError,
  onOpenDeviceAccessSettings,
  onRefreshDeviceNowPlaying,
  onPlay,
  onEnqueue,
  onShare,
}: {
  token: string;
  isDemoMode: boolean;
  deviceNowPlayingSupported: boolean;
  deviceNowPlayingAccessGranted: boolean;
  deviceNowPlayingTrack: DeviceNowPlayingTrack | null;
  deviceNowPlayingMatch: Song | null;
  deviceNowPlayingLoading: boolean;
  deviceNowPlayingResolving: boolean;
  deviceNowPlayingError: string;
  onOpenDeviceAccessSettings: () => void;
  onRefreshDeviceNowPlaying: () => void;
  onPlay: (s: Song, queue?: Song[], index?: number) => void;
  onEnqueue: (song: Song) => void;
  onShare: (s: Song) => void;
}) {
  type DiscoverItem = Song & { isPodcast?: boolean; externalUrl?: string; podcastId?: string };
  const [mode, setMode] = useState<'tracks' | 'podcasts'>('tracks');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [remoteSongs, setRemoteSongs] = useState<DiscoverItem[]>([]);
  const [hasRemoteLoaded, setHasRemoteLoaded] = useState(false);
  const [episodesPodcast, setEpisodesPodcast] = useState<DiscoverItem | null>(null);
  const [episodes, setEpisodes] = useState<Song[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const searchCacheRef = useRef<Map<string, { ts: number; items: DiscoverItem[] }>>(new Map());
  const podcastEpisodesCacheRef = useRef<Map<string, { ts: number; items: Song[] }>>(new Map());
  const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

  useEffect(() => {
    setRemoteSongs([]);
    setHasRemoteLoaded(false);
    setShowAll(false);
  }, [mode]);

  useEffect(() => {
    setShowAll(false);
  }, [query]);

  const openPodcastEpisodes = async (podcast: DiscoverItem) => {
    setEpisodesPodcast(podcast);
    setEpisodes([]);
    setEpisodesError('');
    setEpisodesLoading(true);
    try {
      const accessToken = isDemoMode ? undefined : token;
      const cacheKey = podcast.podcastId || `${podcast.title}|${podcast.artist}`;
      const cached = podcastEpisodesCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL_MS) {
        setEpisodes(cached.items);
        return;
      }
      if (podcast.podcastId) {
        const response = await apiRequest<ApiPodcastEpisodeItem[]>(
          `/podcasts/${encodeURIComponent(podcast.podcastId)}/episodes?limit=30`,
          {},
          accessToken
        );
        const mapped = response.map((ep, idx) => ({
          id: 9_000_000 + idx,
          title: trimSongTitle(ep.title),
          artist: podcast.artist,
          cover: podcast.cover,
          duration: ep.duration || ep.published_at || 'Эпизод',
          streamUrl: ep.stream_url,
        }));
        setEpisodes(mapped);
        podcastEpisodesCacheRef.current.set(cacheKey, { ts: Date.now(), items: mapped });
      } else if (podcast.streamUrl) {
        const single = [{ ...podcast }];
        setEpisodes(single);
        podcastEpisodesCacheRef.current.set(cacheKey, { ts: Date.now(), items: single });
      } else {
        setEpisodesError('Не удалось получить список выпусков');
      }
    } catch (err) {
      setEpisodesError(formatUserFacingError(err, 'Не удалось загрузить выпуски подкаста'));
    } finally {
      setEpisodesLoading(false);
    }
  };

  useEffect(() => {
    if (!token && !isDemoMode) {
      setLoading(false);
      setRemoteSongs([]);
      setHasRemoteLoaded(false);
      return;
    }
    const trimmed = query.trim();
    const effectiveQuery = trimmed.length >= 2 ? trimmed : mode === 'podcasts' ? 'top podcasts' : 'top hits';
    const cacheKey = `${mode}::${effectiveQuery.toLowerCase()}`;
    const cached = searchCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL_MS) {
      setLoading(false);
      setRemoteSongs(cached.items);
      setHasRemoteLoaded(true);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        let mapped: DiscoverItem[] = [];
        if (mode === 'podcasts') {
          const accessToken = isDemoMode ? undefined : token;
          const results = await apiRequest<ApiPodcastSearchItem[]>(
            `/podcasts/search?q=${encodeURIComponent(effectiveQuery)}&limit=20`,
            {},
            accessToken
          );
          mapped = results.map((item, idx) => ({
            id: Number(item.podcast_id) || 3_000_000 + idx,
            title: trimSongTitle(item.title || 'Podcast'),
            artist: item.artist || 'Podcast',
            cover: item.cover_url || PODCASTS[idx % PODCASTS.length].cover,
            duration: item.duration || 'Подкаст',
            streamUrl: item.stream_url || undefined,
            isPodcast: true,
            externalUrl: item.source_url || undefined,
            podcastId: item.podcast_id,
          }));
        } else {
          const accessToken = isDemoMode ? undefined : token;
          const results = await apiRequest<ApiMusicSearchItem[]>(
            `/music/search?q=${encodeURIComponent(effectiveQuery)}&limit=20`,
            {},
            accessToken
          );
          mapped = results.map((item, idx) => ({
            id: 2_000_000 + idx,
            title: trimSongTitle(item.title),
            artist: item.artist,
            cover: item.cover_url || SONGS[idx % SONGS.length].cover,
            duration: item.duration || '—',
            streamUrl: item.stream_url || undefined,
            isPodcast: false,
          }));
        }
        if (cancelled) return;
        searchCacheRef.current.set(cacheKey, { ts: Date.now(), items: mapped });
        setRemoteSongs(mapped);
        setHasRemoteLoaded(true);
      } catch (err) {
        if (!cancelled) {
          setRemoteSongs([]);
          setHasRemoteLoaded(false);
        }
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('401')) {
          console.warn(mode === 'podcasts' ? 'Podcasts search failed' : 'YTM search failed', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, token, isDemoMode, mode]);

  const fallbackList: DiscoverItem[] =
    mode === 'podcasts'
      ? PODCASTS.map((item) => ({ ...item, isPodcast: true }))
      : SONGS.map((item) => ({ ...item, isPodcast: false }));
  const list = hasRemoteLoaded ? remoteSongs : fallbackList;
  const visibleList = showAll ? list : list.slice(0, 8);

  return (
    <>
      <div className="device-now-playing-card glass-card">
        <div className="device-now-playing-header">
          <div>
            <h3>Сейчас на устройстве</h3>
            <p>Берём трек из активного плеера Android и ищем его в Match</p>
          </div>
          <button className="icon-btn glass-btn-sm" onClick={onRefreshDeviceNowPlaying} title="Обновить">
            <RefreshCw size={16} />
          </button>
        </div>

        {!deviceNowPlayingSupported && (
          <div className="device-now-playing-empty">
            Автоопределение доступно только в Android-сборке приложения.
          </div>
        )}

        {deviceNowPlayingSupported && !deviceNowPlayingAccessGranted && (
          <div className="device-now-playing-cta">
            <p>Дайте доступ к уведомлениям, чтобы Match видел активную музыку из других приложений.</p>
            <button className="profile-avatar-btn" onClick={onOpenDeviceAccessSettings}>
              Открыть настройки доступа
            </button>
          </div>
        )}

        {deviceNowPlayingSupported && deviceNowPlayingAccessGranted && !deviceNowPlayingTrack && (
          <div className="device-now-playing-empty">
            {deviceNowPlayingLoading ? 'Ищем активный плеер...' : 'Сейчас на устройстве ничего не играет.'}
          </div>
        )}

        {deviceNowPlayingTrack && (
          <>
            <div className="device-now-playing-track glass-inset">
              <img
                src={deviceNowPlayingTrack.coverDataUrl || deviceNowPlayingMatch?.cover || SONGS[0].cover}
                alt=""
              />
              <div className="device-now-playing-info">
                <h4>{deviceNowPlayingTrack.title}</h4>
                <p>{deviceNowPlayingTrack.artist || 'Неизвестный артист'}</p>
                <span>{deviceNowPlayingTrack.sourceApp || 'Источник не определён'}</span>
              </div>
            </div>

            <div className="device-now-playing-match glass-inset">
              {deviceNowPlayingResolving && (
                <p className="device-now-playing-note">Ищем совпадение в вашей музыке и в Match...</p>
              )}
              {!deviceNowPlayingResolving && deviceNowPlayingMatch && (
                <>
                  <p className="device-now-playing-note">Найдено совпадение в Match</p>
                  <div className="device-now-playing-actions">
                    <button className="profile-avatar-btn" onClick={() => onPlay(deviceNowPlayingMatch)}>
                      Слушать у нас
                    </button>
                    <button className="share-inline-btn device-now-playing-action" onClick={() => onEnqueue(deviceNowPlayingMatch)} title="Добавить в очередь">
                      <Plus size={14} />
                    </button>
                    <button className="share-inline-btn device-now-playing-action" onClick={() => onShare(deviceNowPlayingMatch)} title="Поделиться">
                      <Share2 size={14} />
                    </button>
                  </div>
                </>
              )}
              {!deviceNowPlayingResolving && !deviceNowPlayingMatch && (
                <p className="device-now-playing-note">Точное совпадение пока не найдено. Попробуйте обновить поиск, когда трек стабильно отобразится в плеере.</p>
              )}
            </div>
          </>
        )}

        {deviceNowPlayingError && <div className="auth-error" style={{ marginTop: 10 }}>{deviceNowPlayingError}</div>}
      </div>

      <div className="tag-row">
        <button className={`tag-chip ${mode === 'tracks' ? 'active' : ''}`} onClick={() => setMode('tracks')}>Музыка</button>
        <button className={`tag-chip ${mode === 'podcasts' ? 'active' : ''}`} onClick={() => setMode('podcasts')}>Подкасты</button>
      </div>

      <div className="search-bar glass-inset">
        <Search size={18} />
        <input
          placeholder={mode === 'podcasts' ? 'Поиск подкастов...' : 'Поиск треков и артистов...'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {loading && (
        <div className="search-status">{mode === 'podcasts' ? 'Ищем подкасты...' : 'Ищем треки в каталоге...'}</div>
      )}
      {!loading && query.trim().length < 2 && list.length > 0 && (
        <div className="search-status">{mode === 'podcasts' ? 'Популярные подкасты' : 'Подборка Match'}</div>
      )}
      {!loading && list.length === 0 && (
        <div className="search-status">Ничего не найдено</div>
      )}
      <div className="section-header">
        <h3 className="section-title">{mode === 'podcasts' ? 'Подкасты' : 'Музыка'}</h3>
        {list.length > 8 && (
          <button className="section-more" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Свернуть' : 'Ещё'} <ChevronRight size={16} />
          </button>
        )}
      </div>
      {visibleList.map((song, idx) => (
        <div className="trending-item" key={song.id}>
          <img
            src={song.cover}
            alt=""
            onClick={() => {
              if (song.isPodcast) {
                void openPodcastEpisodes(song);
                return;
              }
              onPlay(song, list, idx);
            }}
          />
          <div
            className="trending-info"
            onClick={() => {
              if (song.isPodcast) {
                void openPodcastEpisodes(song);
                return;
              }
              onPlay(song, list, idx);
            }}
          >
            <h4>{song.title}</h4>
            <p>{song.artist} · {song.duration}</p>
          </div>
          {song.isPodcast ? (
            <button className="play-btn-sm" style={{ width: 32, height: 32 }} onClick={() => void openPodcastEpisodes(song)} title="Выбрать выпуск">
              <Play size={14} fill="#fff" />
            </button>
          ) : (
            <>
              <button className="icon-btn glass-btn-sm" onClick={() => onShare(song)}><Share2 size={16} /></button>
              <button className="play-btn-sm" style={{ width: 32, height: 32 }} onClick={() => onPlay(song, list, idx)}>
                <Play size={14} fill="#fff" />
              </button>
            </>
          )}
        </div>
      ))}
      <AnimatePresence>
        {episodesPodcast && (
          <motion.div
            className="share-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEpisodesPodcast(null)}
          >
            <motion.div
              className="share-sheet podcast-episodes-sheet glass-panel"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', bounce: 0.12 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="share-header">
                <h3>Выпуски: {episodesPodcast.title}</h3>
                <button className="icon-btn glass-btn-sm" onClick={() => setEpisodesPodcast(null)}><X size={18} /></button>
              </div>
              {episodesLoading && <div className="search-status">Загружаем выпуски...</div>}
              {!episodesLoading && episodesError && <div className="auth-error">{episodesError}</div>}
              {!episodesLoading && !episodesError && episodes.length === 0 && (
                <div className="search-status">Доступных выпусков пока нет</div>
              )}
              {!episodesLoading && episodes.map((episode, epIdx) => (
                <div
                  className="trending-item podcast-episode-item"
                  key={`${episode.id}-${epIdx}`}
                  onClick={() => {
                    onPlay(episode, episodes, epIdx);
                    setEpisodesPodcast(null);
                  }}
                >
                  <img src={episode.cover} alt="" />
                  <div className="trending-info">
                    <h4>{episode.title}</h4>
                    <p>{episode.artist} · {episode.duration}</p>
                  </div>
                  <button className="play-btn-sm" style={{ width: 32, height: 32 }}>
                    <Play size={14} fill="#fff" />
                  </button>
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ========== CHAT LIST ========== */
function ChatListScreen({ threads, onOpenChat }: { threads: ChatThread[]; onOpenChat: (t: ChatThread) => void }) {
  if (!threads.length) {
    return <div className="search-status">Чатов пока нет. Добавьте друзей, чтобы начать переписку.</div>;
  }
  return (
    <>
      <div className="tab-pills">
        <button className="tab-pill active">Все</button>
        <button className="tab-pill">Треками поделились</button>
      </div>
      {threads.map((thread) => {
        const lastMsg = thread.messages[thread.messages.length - 1];
        const preview = lastMsg?.songShare
          ? '🎵 Поделился треком'
          : (lastMsg?.text?.trim() || 'Сообщений пока нет');
        return (
          <motion.div className="chat-item" key={thread.friend.id} onClick={() => onOpenChat(thread)} whileTap={{ scale: 0.98 }}>
            <div className="chat-avatar-wrap">
              <img src={thread.friend.avatar} alt="" className="chat-avatar" />
              {thread.friend.isOnline && <div className="online-dot" />}
            </div>
            <div className="chat-info">
              <h4>{thread.friend.name}</h4>
              <p>{preview}</p>
            </div>
            <div className="chat-meta">
              <span className="chat-time">{lastMsg?.time || ''}</span>
              {thread.unread > 0 && <div className="unread-badge">{thread.unread}</div>}
            </div>
          </motion.div>
        );
      })}
    </>
  );
}

/* ========== CHAT DETAIL ========== */
function ChatDetail({
  thread,
  token,
  currentUserId,
  onClose,
  onPlay,
  onThreadActivity,
}: {
  thread: ChatThread;
  token: string;
  currentUserId: number;
  onClose: () => void;
  onPlay: (s: Song) => void;
  onThreadActivity: (friendId: number, lastMessage: ChatMessage | null, unread: number) => void;
}) {
  const isDemoChat = token === DEMO_TOKEN;
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<ChatMessage[]>(thread.messages);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [songPicker, setSongPicker] = useState(false);
  const [songQuery, setSongQuery] = useState('');
  const [songSearchLoading, setSongSearchLoading] = useState(false);
  const [songResults, setSongResults] = useState<Song[]>([]);
  const lastDirectMessageIdRef = useRef(0);

  useEffect(() => {
    if (isDemoChat) {
      setMsgs(thread.messages);
      setLoading(false);
      setChatError('');
      lastDirectMessageIdRef.current = thread.messages[thread.messages.length - 1]?.id || 0;
      return;
    }
    let stop = false;
    setMsgs([]);
    setChatError('');
    setLoading(true);
    lastDirectMessageIdRef.current = 0;

    const poll = async () => {
      try {
        const remote = await apiRequest<ApiDirectMessage[]>(
          `/chats/${thread.friend.id}/messages?after_id=${lastDirectMessageIdRef.current}`,
          {},
          token
        );
        if (stop) return;
        if (remote.length > 0) {
          const nextMessages = remote.map(mapDirectMessageToChatMessage);
          setMsgs((prev) => {
            const merged = [...prev, ...nextMessages];
            const last = merged[merged.length - 1] || null;
            onThreadActivity(thread.friend.id, last, 0);
            return merged;
          });
          lastDirectMessageIdRef.current = nextMessages[nextMessages.length - 1].id;
        }
      } catch (err) {
        if (!stop) setChatError(formatUserFacingError(err, 'Не удалось загрузить сообщения'));
      } finally {
        if (!stop) setLoading(false);
      }
      if (!stop) setTimeout(poll, 1700);
    };

    void poll();
    return () => {
      stop = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.friend.id, token, isDemoChat, thread.messages]);

  useEffect(() => {
    if (!songPicker) return;
    const trimmed = songQuery.trim();
    const effectiveQuery = trimmed.length >= 2 ? trimmed : 'top hits';
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSongSearchLoading(true);
      try {
        const results = await apiRequest<ApiMusicSearchItem[]>(
          `/music/search?q=${encodeURIComponent(effectiveQuery)}&limit=15`,
          {},
          token
        );
        if (cancelled) return;
        const mapped: Song[] = results.map((item, idx) => ({
          id: 7_000_000 + idx,
          title: trimSongTitle(item.title),
          artist: item.artist || 'Unknown Artist',
          cover: item.cover_url || SONGS[idx % SONGS.length].cover,
          duration: item.duration || '—',
          streamUrl: item.stream_url || undefined,
        }));
        setSongResults(mapped);
      } catch {
        if (!cancelled) setSongResults([]);
      } finally {
        if (!cancelled) setSongSearchLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [songPicker, songQuery, token]);

  const sendMsg = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (isDemoChat) {
      const next: ChatMessage = { id: Date.now(), senderId: currentUserId, text, time: 'Сейчас' };
      setMsgs((prev) => [...prev, next]);
      onThreadActivity(thread.friend.id, next, 0);
      setInput('');
      return;
    }
    setSending(true);
    setChatError('');
    try {
      const created = await apiRequest<ApiDirectMessage>(
        `/chats/${thread.friend.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ text }),
        },
        token
      );
      const next = mapDirectMessageToChatMessage(created);
      setMsgs((prev) => [...prev, next]);
      lastDirectMessageIdRef.current = Math.max(lastDirectMessageIdRef.current, next.id);
      onThreadActivity(thread.friend.id, next, 0);
      setInput('');
    } catch (err) {
      setChatError(formatUserFacingError(err, 'Не удалось отправить сообщение'));
    } finally {
      setSending(false);
    }
  };

  const sendSong = async (song: Song) => {
    if (sending) return;
    if (isDemoChat) {
      const next: ChatMessage = { id: Date.now(), senderId: currentUserId, text: `🎵 ${song.title}`, time: 'Сейчас', songShare: song };
      setMsgs((prev) => [...prev, next]);
      onThreadActivity(thread.friend.id, next, 0);
      setSongPicker(false);
      setSongQuery('');
      return;
    }
    setSending(true);
    setChatError('');
    try {
      const created = await apiRequest<ApiDirectMessage>(
        `/chats/${thread.friend.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: `🎵 ${song.title}`,
            song: {
              title: song.title,
              artist: song.artist,
              cover_url: song.cover,
              stream_url: song.streamUrl || null,
              duration: song.duration,
            },
          }),
        },
        token
      );
      const next = mapDirectMessageToChatMessage(created);
      setMsgs((prev) => [...prev, next]);
      lastDirectMessageIdRef.current = Math.max(lastDirectMessageIdRef.current, next.id);
      onThreadActivity(thread.friend.id, next, 0);
      setSongPicker(false);
      setSongQuery('');
    } catch (err) {
      setChatError(formatUserFacingError(err, 'Не удалось отправить трек'));
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div className="chat-detail"
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', bounce: 0.1, duration: 0.4 }}
    >
      <div className="chat-detail-header glass-panel">
        <button className="icon-btn" onClick={onClose}><ArrowLeft size={20} /></button>
        <img src={thread.friend.avatar} alt="" />
        <h3>{thread.friend.name}</h3>
      </div>
      <div className="messages-list">
        {loading && msgs.length === 0 && <div className="search-status">Загружаем сообщения...</div>}
        {!loading && msgs.length === 0 && <div className="search-status">Сообщений пока нет</div>}
        {msgs.map((msg) => {
          const isSent = msg.senderId === currentUserId;
          if (msg.songShare) {
            return (
              <div key={msg.id} className={`msg-song-share ${isSent ? 'sent' : 'received'}`}>
                <div className="msg-song-inner" onClick={() => onPlay(msg.songShare!)}>
                  <img src={msg.songShare.cover} alt="" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h5>{msg.songShare.title}</h5>
                    <p>{msg.songShare.artist}</p>
                  </div>
                  <button className="play-btn-sm" style={{ width: 28, height: 28 }}><Play size={12} fill="#fff" /></button>
                </div>
              </div>
            );
          }
          return <div key={msg.id} className={`msg-bubble ${isSent ? 'sent' : 'received'}`}>{msg.text}</div>;
        })}
      </div>

      <AnimatePresence>
        {songPicker && (
          <motion.div className="song-picker"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', bounce: 0.12 }}
          >
            <div className="song-picker-header">
              <h4>Поделиться треком</h4>
              <button className="icon-btn glass-btn-sm" onClick={() => setSongPicker(false)}><X size={18} /></button>
            </div>
            <div className="search-bar glass-inset" style={{ marginBottom: 10 }}>
              <Search size={16} />
              <input
                placeholder="Найти трек..."
                value={songQuery}
                onChange={(e) => setSongQuery(e.target.value)}
              />
            </div>
            {songSearchLoading && <div className="search-status">Ищем треки...</div>}
            {!songSearchLoading && songResults.length === 0 && <div className="search-status">Ничего не найдено</div>}
            {!songSearchLoading && songResults.map((song) => (
              <motion.div key={`${song.id}-${song.title}`} className="song-picker-item" whileTap={{ scale: 0.97 }} onClick={() => void sendSong(song)}>
                <img src={song.cover} alt="" />
                <div className="song-picker-info">
                  <h5>{song.title}</h5>
                  <p>{song.artist}</p>
                </div>
                <Send size={16} color="var(--orange-main)" />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="chat-input-bar">
        <button className="icon-btn glass-btn-sm" onClick={() => setSongPicker(true)}>
          <Plus size={18} />
        </button>
        <input placeholder="Введите сообщение..." value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void sendMsg(); }}
        />
        <button className="send-btn" onClick={() => void sendMsg()} disabled={sending}><Send size={18} /></button>
      </div>
      {chatError && <div className="auth-error" style={{ margin: '8px 12px 12px' }}>{chatError}</div>}
    </motion.div>
  );
}

/* ========== PROFILE ========== */
function ProfileScreen({
  currentUser,
  stats,
  likedSongs,
  recentSongs,
  likedTrackKeys,
  onToggleLike,
  onUploadAvatar,
  onUploadTrack,
  onUpdateTag,
  onPlay,
}: {
  currentUser: ApiUser;
  stats: ApiProfileStats;
  likedSongs: Song[];
  recentSongs: Song[];
  likedTrackKeys: Set<string>;
  onToggleLike: (song: Song) => Promise<boolean>;
  onUploadAvatar: (file: File) => Promise<void>;
  onUploadTrack: (file: File) => Promise<Song>;
  onUpdateTag: (tag: string) => Promise<void>;
  onPlay: (song: Song) => void;
}) {
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const trackInputRef = useRef<HTMLInputElement | null>(null);
  const [tagInput, setTagInput] = useState(currentUser.tag || '');
  const [savingTag, setSavingTag] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState('');
  const [tagError, setTagError] = useState('');
  const [uploadingTrack, setUploadingTrack] = useState(false);
  const [trackUploadError, setTrackUploadError] = useState('');

  useEffect(() => {
    setTagInput(currentUser.tag || '');
  }, [currentUser.tag]);

  const saveTag = async () => {
    setTagError('');
    const normalized = tagInput.trim().replace(/^@+/, '');
    if (normalized.length < 2) {
      setTagError('Тег должен быть не короче 2 символов');
      return;
    }
    setSavingTag(true);
    try {
      await onUpdateTag(normalized);
    } catch (err) {
      setTagError(formatUserFacingError(err, 'Не удалось обновить тег'));
    } finally {
      setSavingTag(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setAvatarUploadError('');
    try {
      await onUploadAvatar(file);
    } catch (err) {
      setAvatarUploadError(formatUserFacingError(err, 'Не удалось загрузить аватар'));
    }
  };

  const handleTrackUpload = async (file: File) => {
    setTrackUploadError('');
    setUploadingTrack(true);
    try {
      await onUploadTrack(file);
    } catch (err) {
      setTrackUploadError(formatUserFacingError(err, 'Не удалось загрузить трек'));
    } finally {
      setUploadingTrack(false);
    }
  };

  return (
    <>
      <div className="profile-card">
        <img src={currentUser.avatar_url || '/avatars/weeknd.jpg'} alt={currentUser.name} className="profile-avatar" />
        <h2>{currentUser.name}</h2>
        <p>@{currentUser.tag || toUsername(currentUser.name).replace('@', '')}</p>
        <button className="profile-avatar-btn" onClick={() => avatarInputRef.current?.click()}>
          Сменить аватар
        </button>
        <button className="profile-avatar-btn" onClick={() => trackInputRef.current?.click()}>
          {uploadingTrack ? 'Загружаем трек...' : 'Загрузить трек'}
        </button>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void handleAvatarUpload(file);
            e.currentTarget.value = '';
          }}
        />
        <input
          ref={trackInputRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void handleTrackUpload(file);
            e.currentTarget.value = '';
          }}
        />
        <div className="profile-tag-edit">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Ваш тег (например, kenda)"
          />
          <button onClick={() => void saveTag()} disabled={savingTag}>
            {savingTag ? 'Сохраняем...' : 'Сохранить тег'}
          </button>
        </div>
        {avatarUploadError && <div className="auth-error" style={{ marginTop: 8 }}>{avatarUploadError}</div>}
        {tagError && <div className="auth-error" style={{ marginTop: 8 }}>{tagError}</div>}
        {trackUploadError && <div className="auth-error" style={{ marginTop: 8 }}>{trackUploadError}</div>}
        <div className="profile-stats">
          <div className="profile-stat"><span className="num">{stats.friends}</span><span className="label">Друзья</span></div>
          <div className="profile-stat"><span className="num">{stats.tracks}</span><span className="label">Треки</span></div>
          <div className="profile-stat"><span className="num">{stats.likes}</span><span className="label">Лайки</span></div>
        </div>
      </div>
      <div className="section-header"><h3 className="section-title">Лайкнутые треки</h3></div>
      {likedSongs.slice(0, 20).map((song) => (
        <div className="trending-item" key={song.id} onClick={() => onPlay(song)}>
          <img src={song.cover} alt="" />
          <div className="trending-info"><h4>{song.title}</h4><p>{song.artist} · {song.duration}</p></div>
          <motion.button
            className="icon-btn glass-btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              void onToggleLike(song);
            }}
            animate={likedTrackKeys.has(trackKeyOfSong(song)) ? { scale: [1, 1.18, 1] } : { scale: 1 }}
            transition={{ duration: 0.28 }}
          >
            <Heart size={18} color={likedTrackKeys.has(trackKeyOfSong(song)) ? 'var(--orange-main)' : 'currentColor'} />
          </motion.button>
          <button className="play-btn-sm" style={{ width: 32, height: 32 }} onClick={(e) => {
            e.stopPropagation();
            onPlay(song);
          }}>
            <Play size={14} fill="#fff" />
          </button>
        </div>
      ))}
      {likedSongs.length === 0 && <div className="search-status">Пока нет лайков</div>}
      <div className="section-header"><h3 className="section-title">Последние прослушанные треки</h3></div>
      {recentSongs.map((song) => (
        <div className="trending-item" key={song.id} onClick={() => onPlay(song)}>
          <img src={song.cover} alt="" />
          <div className="trending-info"><h4>{song.title}</h4><p>{song.artist} · {song.duration}</p></div>
          <button className="play-btn-sm" style={{ width: 32, height: 32 }} onClick={(e) => {
            e.stopPropagation();
            onPlay(song);
          }}>
            <Play size={14} fill="#fff" />
          </button>
        </div>
      ))}
      {recentSongs.length === 0 && <div className="search-status">Здесь будут появляться последние треки, которые вы слушали</div>}
    </>
  );
}

/* ========== BOTTOM NAV ========== */
function BottomNav({ tab, onChangeTab }: { tab: Tab; onChangeTab: (t: Tab) => void }) {
  const items: { id: Tab; icon: typeof Home; label: string }[] = [
    { id: 'friends', icon: Home, label: 'Друзья' },
    { id: 'discover', icon: Search, label: 'Открытия' },
    { id: 'chat', icon: MessageCircle, label: 'Чаты' },
    { id: 'profile', icon: User, label: 'Профиль' },
  ];
  return (
    <nav className="bottom-nav">
      {items.map((item, idx) => {
        const Icon = item.icon;
        const active = tab === item.id;
        return (
          <motion.button
            key={item.id}
            type="button"
            className={`nav-item ${active ? 'active' : ''}`}
            onClick={() => onChangeTab(item.id)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: active ? -2 : 0, scale: active ? 1.02 : 1 }}
            transition={{
              opacity: { duration: 0.2, delay: idx * 0.04 },
              y: { type: 'spring', stiffness: 320, damping: 24 },
              scale: { type: 'spring', stiffness: 320, damping: 24 },
            }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              className="nav-icon-wrap"
              animate={{ scale: active ? 1.08 : 1, rotate: active ? 2 : 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 22 }}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
            </motion.div>
            <motion.span
              animate={{ y: active ? -1 : 0, opacity: active ? 1 : 0.86 }}
              transition={{ type: 'spring', stiffness: 350, damping: 24 }}
            >
              {item.label}
            </motion.span>
          </motion.button>
        );
      })}
    </nav>
  );
}

/* ========== NOW PLAYING FULLSCREEN (with scrollable chat) ========== */
function NowPlayingFull({ song, isPlaying, currentTimeSec, durationSec, isLiked, shuffleOn, repeatMode, queue, queueIndex, listeningWith, onClose, onToggle, onNext, onPrev, onSeek, onToggleLike, onToggleShuffle, onCycleRepeat, onQueueSelect, onQueueRemove, token, currentUserId, sessionActive, sessionId, sessionMessages, onSendSessionMessage, onLeaveSession, onShare }: {
  song: Song;
  isPlaying: boolean;
  currentTimeSec: number;
  durationSec: number;
  isLiked: boolean;
  shuffleOn: boolean;
  repeatMode: RepeatMode;
  queue: Song[] | null;
  queueIndex: number | null;
  listeningWith: Friend | null;
  onClose: () => void;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (timeSec: number) => void;
  onToggleLike: () => Promise<boolean>;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onQueueSelect: (index: number) => void;
  onQueueRemove: (index: number) => void;
  token: string;
  currentUserId: number;
  sessionActive: boolean;
  sessionId: number | null;
  sessionMessages: ApiSessionMessage[];
  onSendSessionMessage: (text: string) => Promise<void>;
  onLeaveSession: () => Promise<void>;
  onShare: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingSeekRef = useRef(false);
  const [micActive, setMicActive] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const micEnabledRef = useRef(false);
  const visibleQueue = queue && queue.length > 0 ? queue : [song];

  const teardownVoice = (stopLocal: boolean) => {
    wsRef.current?.close();
    wsRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (stopLocal) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      micEnabledRef.current = false;
      setMicActive(false);
    }
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  };

  const sendVoiceSignal = (payload: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  };

  const ensurePeerConnection = () => {
    if (peerRef.current) return peerRef.current;
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendVoiceSignal({ type: 'ice', candidate: event.candidate });
    };
    pc.ontrack = (event) => {
      if (!remoteAudioRef.current) return;
      const [stream] = event.streams;
      if (!stream) return;
      remoteAudioRef.current.srcObject = stream;
      void remoteAudioRef.current.play().catch(() => undefined);
    };
    peerRef.current = pc;
    return pc;
  };

  const ensureLocalAudio = async () => {
    if (!localStreamRef.current) {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    const pc = ensurePeerConnection();
    const stream = localStreamRef.current;
    for (const track of stream.getAudioTracks()) {
      track.enabled = micEnabledRef.current;
      const hasSender = pc.getSenders().some((sender) => sender.track?.id === track.id);
      if (!hasSender) pc.addTrack(track, stream);
    }
  };

  const negotiateOffer = async () => {
    const pc = ensurePeerConnection();
    if (pc.signalingState !== 'stable') return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (pc.localDescription) {
      sendVoiceSignal({ type: 'offer', sdp: pc.localDescription });
    }
  };

  const toggleVoice = async () => {
    if (!sessionActive || !sessionId) return;
    setVoiceError('');
    if (micEnabledRef.current) {
      micEnabledRef.current = false;
      setMicActive(false);
      localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
      sendVoiceSignal({ type: 'mute', muted: true });
      return;
    }
    try {
      micEnabledRef.current = true;
      setMicActive(true);
      await ensureLocalAudio();
      await negotiateOffer();
      sendVoiceSignal({ type: 'mute', muted: false });
    } catch {
      micEnabledRef.current = false;
      setMicActive(false);
      setVoiceError('Не удалось получить доступ к микрофону');
    }
  };

  const sendChat = () => {
    if (!sessionActive || !chatInput.trim()) return;
    void onSendSessionMessage(chatInput.trim());
    setChatInput('');
  };

  useEffect(() => {
    if (!sessionActive || !sessionId || !token) {
      teardownVoice(true);
      return;
    }

    setVoiceError('');
    const wsBase = API_BASE.replace(/^http/i, (prefix) => (prefix.toLowerCase() === 'https' ? 'wss' : 'ws'));
    const wsUrl = `${wsBase}/listen/${sessionId}/voice-signal/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!micEnabledRef.current) return;
      void ensureLocalAudio().then(() => negotiateOffer()).catch(() => undefined);
    };

    ws.onmessage = (event) => {
      void (async () => {
        try {
          const envelope = JSON.parse(event.data) as { from_user_id?: number; data?: any };
          if (envelope.from_user_id === currentUserId) return;
          const signal = envelope.data || {};
          const pc = ensurePeerConnection();

          if (signal.type === 'offer' && signal.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            if (!localStreamRef.current && !pc.getTransceivers().some((item) => item.receiver.track?.kind === 'audio')) {
              pc.addTransceiver('audio', { direction: 'recvonly' });
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (pc.localDescription) sendVoiceSignal({ type: 'answer', sdp: pc.localDescription });
            return;
          }

          if (signal.type === 'answer' && signal.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            return;
          }

          if (signal.type === 'ice' && signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => undefined);
          }
        } catch {
          // noop: voice signaling is best-effort in MVP
        }
      })();
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      teardownVoice(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionActive, sessionId, token, currentUserId]);

  const progressPercent = durationSec > 0 ? Math.min(100, (currentTimeSec / durationSec) * 100) : 0;

  const seekByClientX = (clientX: number) => {
    if (!trackRef.current || durationSec <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(durationSec * ratio);
  };

  return (
    <motion.div className="now-playing-full np-purple"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', bounce: 0.12, duration: 0.5 }}
    >
      {/* Fixed top bar */}
      <div className="np-top-bar">
        <button className="np-icon-btn" onClick={onClose}><ChevronDown size={24} /></button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <span className="np-label">Сейчас играет</span>
          {listeningWith && (
            <p className="np-with">🎧 с {listeningWith.name}</p>
          )}
        </div>
        <button className="np-icon-btn" onClick={onShare}><Share2 size={20} /></button>
      </div>

      {/* Scrollable content */}
      <div className="np-scroll">
        {/* Album art */}
        <div className="np-art-section">
          <motion.img src={song.cover} alt="" className="np-art" key={song.id}
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', bounce: 0.2 }}
          />
        </div>

        {/* Song info */}
        <div className="np-song-info">
          <h2>{song.title}</h2>
          <p>{song.artist}</p>
        </div>

        {/* Progress */}
        <div className="np-progress">
          <div
            ref={trackRef}
            className="progress-track"
            onPointerDown={(e) => {
              draggingSeekRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              seekByClientX(e.clientX);
            }}
            onPointerMove={(e) => {
              if (!draggingSeekRef.current) return;
              seekByClientX(e.clientX);
            }}
            onPointerUp={(e) => {
              draggingSeekRef.current = false;
              seekByClientX(e.clientX);
            }}
            onPointerCancel={() => {
              draggingSeekRef.current = false;
            }}
          >
            <div className="progress-fill" style={{ width: `${progressPercent}%` }}><div className="progress-thumb" /></div>
          </div>
          <div className="progress-times">
            <span>{formatTime(currentTimeSec)}</span>
            <span>{durationSec > 0 ? formatTime(durationSec) : song.duration}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="np-controls">
          <motion.button
            className={`np-ctrl-btn ${shuffleOn ? 'active' : ''}`}
            whileTap={{ scale: 0.85 }}
            onClick={onToggleShuffle}
            title={shuffleOn ? 'Перемешивание включено' : 'Перемешивание выключено'}
          >
            <Shuffle size={20} />
          </motion.button>
          <motion.button className="np-ctrl-btn" whileTap={{ scale: 0.85 }} onClick={onPrev}><SkipBack size={22} fill="#fff" /></motion.button>
          <motion.button className="np-ctrl-btn main" whileTap={{ scale: 0.88 }} onClick={onToggle}>
            {isPlaying ? <Pause size={28} fill="#fff" /> : <Play size={28} fill="#fff" />}
          </motion.button>
          <motion.button className="np-ctrl-btn" whileTap={{ scale: 0.85 }} onClick={onNext}><SkipForward size={22} fill="#fff" /></motion.button>
          <motion.button
            className={`np-ctrl-btn ${repeatMode !== 'off' ? 'active' : ''}`}
            whileTap={{ scale: 0.85 }}
            onClick={onCycleRepeat}
            title={`Повтор: ${repeatMode === 'off' ? 'выкл' : repeatMode === 'all' ? 'все' : 'один трек'}`}
          >
            <Repeat size={20} />
            {repeatMode === 'one' && <span className="np-ctrl-badge">1</span>}
          </motion.button>
        </div>

        {/* Mic button */}
        <div className="np-mic-row">
          <motion.button
            className={`mic-pill ${micActive ? 'active' : ''}`}
            whileTap={{ scale: 0.92 }}
            onClick={() => void toggleVoice()}
          >
            {micActive ? <MicOff size={20} /> : <Mic size={20} />}
            <span>{micActive ? 'Без звука' : 'Говорить'}</span>
          </motion.button>
        </div>
        {voiceError && <div className="player-error" style={{ marginTop: -2, marginBottom: 10 }}>{voiceError}</div>}

        {/* Actions */}
        <div className="np-actions">
          <motion.button
            className={`np-chip ${isLiked ? 'liked' : ''}`}
            whileTap={{ scale: 0.92 }}
            animate={isLiked ? { scale: [1, 1.14, 1] } : { scale: 1 }}
            transition={{ duration: 0.28 }}
            onClick={() => void onToggleLike()}
          >
            <Heart size={16} color={isLiked ? 'var(--orange-main)' : 'currentColor'} /> Нравится
          </motion.button>
          <motion.button className="np-chip" whileTap={{ scale: 0.92 }} onClick={onShare}><Share2 size={16} /> Поделиться</motion.button>
          {sessionActive && (
            <motion.button className="np-chip np-chip-danger" whileTap={{ scale: 0.92 }} onClick={() => void onLeaveSession()}>
              <X size={16} /> Выйти из эфира
            </motion.button>
          )}
        </div>

        {/* ===== INLINE CHAT SECTION ===== */}
        {listeningWith && sessionActive && (
          <div className="np-chat-section">
            <div className="np-chat-header">
              <img src={listeningWith.avatar} alt="" />
              <div>
                <h4>Чат с {listeningWith.name}</h4>
                <p>Слушаете вместе</p>
              </div>
            </div>

            <div className="np-chat-messages">
              {sessionMessages.map((msg) => (
                <div key={msg.id} className={`np-chat-bubble ${msg.sender_id === currentUserId ? 'sent' : 'received'}`}>
                  {msg.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {(!listeningWith || !sessionActive) && (
          <div className="np-no-session">
            <p>Нажмите на трек друга, чтобы слушать вместе</p>
          </div>
        )}

        <div className="np-queue-section">
          <div className="np-queue-header">
            <h4>Очередь</h4>
            <span>{visibleQueue.length} трек{visibleQueue.length === 1 ? '' : visibleQueue.length < 5 ? 'а' : 'ов'}</span>
          </div>
          <div className="np-queue-list">
            {visibleQueue.map((queueSong, index) => {
              const isCurrent = queueIndex !== null
                ? index === queueIndex
                : trackKeyOfSong(queueSong) === trackKeyOfSong(song);
              return (
                <div
                  key={`${trackKeyOfSong(queueSong)}-${index}`}
                  className={`np-queue-item ${isCurrent ? 'current' : ''}`}
                  onClick={() => onQueueSelect(index)}
                >
                  <div className="np-queue-main">
                    <img src={queueSong.cover} alt="" />
                    <div className="np-queue-info">
                      <h5>{queueSong.title}</h5>
                      <p>{queueSong.artist}</p>
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="np-queue-current">Сейчас</span>
                  ) : (
                    <button
                      className="np-queue-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        onQueueRemove(index);
                      }}
                      title="Убрать из очереди"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Fixed chat input at bottom */}
      {listeningWith && sessionActive && (
        <div className="np-chat-input glass-panel">
          <input placeholder={`Сообщение для ${listeningWith.name}...`} value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
          />
          <button className="np-send-btn" onClick={sendChat}><Send size={18} /></button>
        </div>
      )}
      <audio ref={remoteAudioRef} autoPlay playsInline />
    </motion.div>
  );
}
