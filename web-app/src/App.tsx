import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Search, MessageCircle, User,
  Play, Pause, SkipForward, SkipBack,
  ChevronDown, Heart, Shuffle, Repeat,
  Share2, Send, ArrowLeft, Bell, LogOut,
  Music, Plus, ChevronRight,
  Mic, MicOff, X
} from 'lucide-react';
import { SONGS, FRIENDS, TRENDING_TAGS, type Song, type Friend, type ChatThread } from './data/mockData';
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
type AuthMode = 'login' | 'register';
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

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'https://matchapp.site/api';
const API_ORIGIN = API_BASE.replace(/\/api$/, '');
const AUTH_STORAGE_KEY = 'match_backend_token';
const AVATAR_POOL = ['/avatars/danya.jpg', '/avatars/oleg.jpg', '/avatars/aleksandr.jpg', '/avatars/galya.jpg'];
const LAST_ACTIVE_POOL = ['Только что', '2 мин назад', '10 мин назад', '1 ч назад'];

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

const isLikelyPlayableUrl = (url: string): boolean => {
  if (!url) return false;
  if (url.includes('/music/stream/')) return true;
  return /^https?:\/\/.+/i.test(url);
};

const trackKeyOfSong = (song: Song): string => {
  if (song.streamUrl?.startsWith('/music/stream/')) {
    return song.streamUrl.replace('/music/stream/', 'yt:');
  }
  if (song.streamUrl) return `stream:${song.streamUrl}`;
  return `local:${song.id}:${song.title}:${song.artist}`;
};

const normalizeAvatarUrl = (raw?: string | null): string | undefined => {
  if (!raw) return undefined;
  if (raw.startsWith('https://matchapp.site/files/')) {
    return raw.replace('https://matchapp.site/files/', 'https://matchapp.site/api/files/');
  }
  if (raw.startsWith('/files/')) return `${API_BASE}${raw}`;
  return raw;
};

const mapBackendSongToUiSong = (song: ApiSong, idx: number): Song => {
  const base = SONGS[idx % SONGS.length];
  const rawUrl = song.stream_url || song.url || '';
  let streamUrl: string | undefined;
  if (isLikelyPlayableUrl(rawUrl)) {
    if (rawUrl.startsWith('/api/')) {
      streamUrl = `${API_ORIGIN}${rawUrl}`;
    } else if (rawUrl.startsWith('/music/stream/')) {
      streamUrl = rawUrl;
    } else {
      streamUrl = rawUrl;
    }
  }
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
  return {
    id: 3_000_000 + idx,
    title: trimSongTitle(track.title),
    artist: track.artist || 'Unknown Artist',
    cover: track.cover_url || base.cover,
    duration: track.duration || '—',
    streamUrl: track.stream_url || undefined,
  };
};

const mapSessionSongToUiSong = (song: ApiSong): Song => {
  const base = SONGS[0];
  const rawUrl = song.stream_url || song.url || '';
  let streamUrl: string | undefined;
  if (isLikelyPlayableUrl(rawUrl)) {
    if (rawUrl.startsWith('/api/')) streamUrl = `${API_ORIGIN}${rawUrl}`;
    else if (rawUrl.startsWith('/music/stream/')) streamUrl = rawUrl;
    else streamUrl = rawUrl;
  }
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

const getSessionTargetSec = (session: ApiSession): number => {
  const base = Math.max(0, session.position_sec || 0);
  if (!session.is_playing || !session.updated_at) return base;
  const ts = Date.parse(session.updated_at);
  if (!Number.isFinite(ts)) return base;
  const elapsed = (Date.now() - ts) / 1000;
  return Math.max(0, base + Math.max(0, elapsed));
};

const buildThreadsFromFriends = (friends: Friend[]): ChatThread[] =>
  friends.slice(0, 4).map((friend, i) => ({
    friend,
    unread: i % 2,
    messages: [
      { id: i * 10 + 1, senderId: friend.id, text: 'Привет! Как дела?', time: 'Недавно' },
      ...(friend.currentSong ? [{ id: i * 10 + 2, senderId: friend.id, text: '', time: 'Недавно', songShare: friend.currentSong }] : []),
    ],
  }));

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
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

function formatAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Ошибка авторизации';
  const msg = raw.replace(/^API \d+:\s*/i, '').trim();
  const lower = msg.toLowerCase();

  if (lower.includes('at least 6 characters')) return 'Пароль слишком короткий. Минимум 6 символов.';
  if (lower.includes('email already registered')) return 'Этот email уже зарегистрирован.';
  if (lower.includes('name already exists')) return 'Это имя уже занято.';
  if (lower.includes('invalid credentials')) return 'Неверный email или пароль.';
  if (lower.includes('user not found')) return 'Пользователь с таким email не найден.';
  if (lower.includes('field required')) return 'Заполните все обязательные поля.';
  if (lower.includes('string should have at least')) return 'Слишком короткое значение в одном из полей.';

  return msg || 'Ошибка авторизации';
}

export default function App() {
  const [tab, setTab] = useState<Tab>('friends');
  const [isPlaying, setIsPlaying] = useState(false);
  const [songIndex, setSongIndex] = useState(0);
  const [npOpen, setNpOpen] = useState(false);
  const [openChat, setOpenChat] = useState<ChatThread | null>(null);
  const [shareModal, setShareModal] = useState<Song | null>(null);
  const [listeningWith, setListeningWith] = useState<Friend | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [customSong, setCustomSong] = useState<Song | null>(null);
  const [token, setToken] = useState<string>(() => localStorage.getItem(AUTH_STORAGE_KEY) || '');
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [profileStats, setProfileStats] = useState<ApiProfileStats>({ friends: 0, tracks: 0, likes: 0, playlists: 0 });
  const [likedTrackKeys, setLikedTrackKeys] = useState<Set<string>>(new Set());
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [activeSession, setActiveSession] = useState<ApiSession | null>(null);
  const [sessionMessages, setSessionMessages] = useState<ApiSessionMessage[]>([]);
  const [currentBackendSongId, setCurrentBackendSongId] = useState<number | null>(null);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentSongRef = useRef<Song>(SONGS[0]);
  const shuffleRef = useRef(shuffleOn);
  const repeatModeRef = useRef<RepeatMode>(repeatMode);
  const nextTrackRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef(token);
  const clearNowPlayingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageIdRef = useRef(0);
  const handledInviteIdsRef = useRef<Set<number>>(new Set());
  const suppressSessionSyncRef = useRef(false);
  const lastAppliedSessionSongIdRef = useRef<number | null>(null);

  const currentSong = customSong || SONGS[songIndex];
  const resolveStreamUrl = (song: Song): string | null => {
    if (!song.streamUrl) return null;
    if (song.streamUrl.startsWith('http')) return song.streamUrl;
    if (song.streamUrl.startsWith('/')) return `${API_BASE}${song.streamUrl}`;
    return null;
  };

  const startPlayback = async (song: Song) => {
    const audio = audioRef.current;
    if (!audio) return;

    const streamUrl = resolveStreamUrl(song);
    if (!streamUrl) {
      setPlayerError('Для этого трека нет доступного аудио-потока');
      setIsPlaying(false);
      return;
    }

    setPlayerError('');
    if (clearNowPlayingTimerRef.current) {
      clearTimeout(clearNowPlayingTimerRef.current);
      clearNowPlayingTimerRef.current = null;
    }
    if (audio.src !== streamUrl) {
      audio.src = streamUrl;
      audio.load();
    }

    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setPlayerError('Не удалось начать воспроизведение');
      setIsPlaying(false);
    }
  };

  const next = () => {
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

  const clearNowPlayingOnBackend = async () => {
    const accessToken = tokenRef.current;
    if (!accessToken) return;
    try {
      await apiRequest<{ ok: boolean }>('/me/now-playing', { method: 'DELETE' }, accessToken);
    } catch {
      // no-op: transient failures here are acceptable
    }
  };

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

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
    setAuthError('');
    setProfileStats({ friends: 0, tracks: 0, likes: 0, playlists: 0 });
    setLikedTrackKeys(new Set());
    setLikedSongs([]);
    audioRef.current?.pause();
    setIsPlaying(false);
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
      if (clearNowPlayingTimerRef.current) {
        clearTimeout(clearNowPlayingTimerRef.current);
        clearNowPlayingTimerRef.current = null;
      }
      setIsPlaying(true);
    };
    const onPause = () => {
      setIsPlaying(false);
      if (clearNowPlayingTimerRef.current) clearTimeout(clearNowPlayingTimerRef.current);
      clearNowPlayingTimerRef.current = setTimeout(() => {
        void clearNowPlayingOnBackend();
      }, 1200);
    };
    const onEnded = async () => {
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
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
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
      audio.removeEventListener('timeupdate', syncTime);
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  const loadFriends = async (accessToken: string) => {
    setIsLoadingData(true);
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
          return {
            id: bf.id,
            name: bf.name,
            username: toUsername(bf.name),
            avatar: normalizeAvatarUrl(bf.avatar_url) || AVATAR_POOL[idx % AVATAR_POOL.length] || fallback.avatar,
            isOnline: true,
            isListening: Boolean(nowPlaying?.song),
            currentSong: nowPlaying?.song ? mapBackendSongToUiSong(nowPlaying.song, idx) : undefined,
            lastActive: LAST_ACTIVE_POOL[idx % LAST_ACTIVE_POOL.length],
          } satisfies Friend;
        })
      );

      setFriends(mapped);
      const threads = buildThreadsFromFriends(mapped);
      setChatThreads(threads);
      setOpenChat((prev) => (prev ? threads.find((t) => t.friend.id === prev.friend.id) ?? null : null));
    } finally {
      setIsLoadingData(false);
    }
  };

  const loadProfileData = async (accessToken: string) => {
    const [stats, likes] = await Promise.all([
      apiRequest<ApiProfileStats>('/me/stats', {}, accessToken),
      apiRequest<ApiLikedTrack[]>('/me/likes', {}, accessToken),
    ]);
    setProfileStats(stats);
    setLikedTrackKeys(new Set(likes.map((item) => item.track_key)));
    setLikedSongs(likes.map((item, idx) => mapLikedTrackToSong(item, idx)));
  };

  const refreshProfileStats = async (accessToken: string) => {
    const stats = await apiRequest<ApiProfileStats>('/me/stats', {}, accessToken);
    setProfileStats(stats);
  };

  const findFriendById = (id: number): Friend | null => friends.find((f) => f.id === id) || null;

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
      setAuthError(err instanceof Error ? err.message : 'Не удалось поставить лайк');
      return false;
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!token) return;
    const data = new FormData();
    data.append('file', file);
    const updated = await apiRequest<ApiUser>('/me/avatar/upload', {
      method: 'POST',
      body: data,
    }, token);
    setCurrentUser({ ...updated, avatar_url: normalizeAvatarUrl(updated.avatar_url) || null });
  };

  const updateMyTag = async (nextTag: string) => {
    if (!token || !currentUser) return;
    const updated = await apiRequest<ApiUser>('/me/tag', {
      method: 'PUT',
      body: JSON.stringify({ tag: nextTag }),
    }, token);
    setCurrentUser((prev) => (prev ? { ...prev, tag: updated.tag } : prev));
  };

  useEffect(() => {
    let cancelled = false;

    const validateToken = async () => {
      if (!token) {
        setAuthReady(true);
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
    void loadFriends(token);
    void loadProfileData(token);
  }, [token, currentUser]);

  useEffect(() => {
    if (!token || !currentUser) return;
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
      if (!stop) setTimeout(poll, 3500);
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [token, currentUser, friends]);

  useEffect(() => {
    if (!token || !currentUser) return;
    let stop = false;
    const tick = async () => {
      let nextDelay = 2500;
      try {
        const session = await apiRequest<ApiSession | null>('/listen/active', {}, token);
        setActiveSession(session);
        if (session) nextDelay = 1200;
        if (!session) {
          setListeningWith(null);
          setSessionMessages([]);
          lastMessageIdRef.current = 0;
          lastAppliedSessionSongIdRef.current = null;
          setCurrentBackendSongId(null);
        }
        if (session && session.song) {
          setCurrentBackendSongId(session.song.id);
          const mateId = session.host_id === currentUser.id ? session.guest_id : session.host_id;
          const mate = findFriendById(mateId);
          if (mate) setListeningWith(mate);
          setNpOpen(true);
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
  }, [token, currentUser, friends]);

  useEffect(() => {
    if (!token || !activeSession) return;
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
  }, [token, activeSession]);

  useEffect(() => {
    if (!token || !activeSession || suppressSessionSyncRef.current || !currentUser) return;
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
  }, [token, activeSession, currentUser, currentBackendSongId]);

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
      setToken(auth.access_token);
      setCurrentUser({ ...auth.user, avatar_url: normalizeAvatarUrl(auth.user.avatar_url) || null });
    } catch (err) {
      setAuthError(formatAuthError(err));
    }
  };

  const addFriend = async (friendName: string) => {
    if (!token || !friendName.trim()) return;
    try {
      await apiRequest<ApiUser>('/friends', {
        method: 'POST',
        body: JSON.stringify({ friend_name: friendName.trim() }),
      }, token);
      await loadFriends(token);
      await refreshProfileStats(token);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Не удалось добавить друга');
    }
  };

  const searchUsers = async (query: string): Promise<ApiUser[]> => {
    if (!token) return [];
    return apiRequest<ApiUser[]>(`/users/search?q=${encodeURIComponent(query)}`, {}, token);
  };

  const syncNowPlayingToBackend = async (song: Song): Promise<ApiSong | null> => {
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

  const inviteToListen = async (friendId: number, songId: number | null, positionSec: number, isPlayingNow: boolean) => {
    if (!token) return;
    try {
      const session = await apiRequest<ApiSession>('/listen/invite', {
        method: 'POST',
        body: JSON.stringify({ friend_id: friendId, song_id: songId, position_sec: Math.max(0, Math.floor(positionSec)), is_playing: isPlayingNow }),
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
    if (!token) return;
    const accepted = await apiRequest<ApiSession>(`/listen/${sessionId}/accept`, { method: 'POST' }, token);
    setActiveSession(accepted);
    setCurrentBackendSongId(accepted.song?.id ?? null);
    setSessionMessages([]);
    lastMessageIdRef.current = 0;
    if (accepted.song) {
      const mateId = currentUser && accepted.host_id === currentUser.id ? accepted.guest_id : accepted.host_id;
      const mate = findFriendById(mateId);
      if (mate) setListeningWith(mate);
      setNpOpen(true);
      const sessionSong = mapSessionSongToUiSong(accepted.song);
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
    if (!token || !activeSession) return;
    try {
      const msg = await apiRequest<ApiSessionMessage>(`/listen/${activeSession.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }, token);
      setSessionMessages((prev) => [...prev, msg]);
      lastMessageIdRef.current = Math.max(lastMessageIdRef.current, msg.id);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Не удалось отправить сообщение');
    }
  };

  const playSong = (song: Song, friend?: Friend) => {
    const idx = SONGS.findIndex(s => s.id === song.id);
    if (idx >= 0) {
      setSongIndex(idx);
      setCustomSong(null);
    } else {
      setCustomSong(song);
    }
    setIsPlaying(true);
    setListeningWith(friend ?? null);
    if (friend) setNpOpen(true);
    void startPlayback(song);
    void (async () => {
      const created = await syncNowPlayingToBackend(song);
      if (created?.id) setCurrentBackendSongId(created.id);
      if (friend) {
        const currentPos = audioRef.current?.currentTime || 0;
        await inviteToListen(friend.id, created?.id ?? null, currentPos, true);
      }
    })();
  };

  if (!authReady) {
    return <div className="auth-loading">Проверяем сессию...</div>;
  }

  if (!token || !currentUser) {
    return (
      <AuthScreen
        error={authError}
        onSubmit={submitAuth}
      />
    );
  }

  return (
    <>
      <AppHeader tab={tab} currentUser={currentUser} onLogout={clearSession} />

      <div className="screen-scroll" key={tab}>
        {tab === 'friends' && (
          <FriendsScreen
            friends={friends}
            loading={isLoadingData}
            onAddFriend={addFriend}
            onSearchUsers={searchUsers}
            onPlay={playSong}
            onShare={(s) => setShareModal(s)}
          />
        )}
        {tab === 'discover' && (
          <DiscoverScreen
            token={token}
            likedTrackKeys={likedTrackKeys}
            onToggleLike={toggleLike}
            onPlay={(s) => playSong(s)}
            onShare={(s) => setShareModal(s)}
          />
        )}
        {tab === 'chat' && <ChatListScreen threads={chatThreads} onOpenChat={setOpenChat} />}
        {tab === 'profile' && (
          <ProfileScreen
            currentUser={currentUser}
            stats={profileStats}
            likedSongs={likedSongs}
            likedTrackKeys={likedTrackKeys}
            onToggleLike={toggleLike}
            onUploadAvatar={uploadAvatar}
            onUpdateTag={updateMyTag}
          />
        )}
      </div>

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
            listeningWith={listeningWith}
            onClose={() => setNpOpen(false)}
            onToggle={toggle}
            onNext={next}
            onPrev={prev}
            onSeek={seekTo}
            onToggleLike={() => toggleLike(currentSong)}
            onToggleShuffle={toggleShuffle}
            onCycleRepeat={cycleRepeat}
            currentUserId={currentUser.id}
            sessionActive={Boolean(activeSession)}
            sessionMessages={sessionMessages}
            onSendSessionMessage={sendSessionMessage}
            onShare={() => setShareModal(currentSong)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openChat && (
          <ChatDetail thread={openChat} onClose={() => setOpenChat(null)} onPlay={(s) => playSong(s)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shareModal && (
          <ShareModal song={shareModal} friends={friends} onClose={() => setShareModal(null)} />
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

/* ========== AUTH ========== */
function AuthScreen({
  onSubmit,
  error,
}: {
  onSubmit: (mode: AuthMode, email: string, password: string, name?: string) => Promise<void>;
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
        <p>Войдите по почте и паролю</p>

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
        </div>

        {error && <div className="auth-error">{error}</div>}
      </motion.div>
    </div>
  );
}

/* ========== SHARE MODAL ========== */
function ShareModal({ song, friends, onClose }: { song: Song; friends: Friend[]; onClose: () => void }) {
  const handleShare = async (friend: Friend) => {
    const text = `🎵 ${friend.name}, послушай "${song.title}" — ${song.artist}!`;
    try {
      if (navigator.share) {
        await navigator.share({ title: song.title, text, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(text);
        alert(`Отправлено ${friend.name}! 📋`);
      }
    } catch {}
    onClose();
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

/* ========== FRIENDS SCREEN ========== */
function FriendsScreen({
  friends,
  loading,
  onAddFriend,
  onSearchUsers,
  onPlay,
  onShare,
}: {
  friends: Friend[];
  loading: boolean;
  onAddFriend: (name: string) => Promise<void>;
  onSearchUsers: (query: string) => Promise<ApiUser[]>;
  onPlay: (s: Song, f?: Friend) => void;
  onShare: (s: Song) => void;
}) {
  const [friendName, setFriendName] = useState('');
  const [suggestions, setSuggestions] = useState<ApiUser[]>([]);
  const [searching, setSearching] = useState(false);

  const submitAddFriend = async () => {
    const trimmed = friendName.trim();
    if (!trimmed || !trimmed.startsWith('@')) return;
    await onAddFriend(trimmed);
    setFriendName('');
    setSuggestions([]);
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
          <div className="story-item" key={f.id}>
            <div className={`story-ring ${f.isListening ? '' : 'inactive'}`}>
              <img src={f.avatar} alt={f.name} />
            </div>
            <span className="story-name">{f.name.split(' ')[0]}</span>
          </div>
        ))}
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
          <div className="widget-user">
            <div className="widget-avatar-wrap">
              <img src={friend.avatar} alt="" className="widget-avatar" />
              {friend.isOnline && <div className={`online-dot ${friend.isListening ? 'listening' : ''}`} />}
            </div>
            <div className="widget-user-info">
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
  likedTrackKeys,
  onToggleLike,
  onPlay,
  onShare,
}: {
  token: string;
  likedTrackKeys: Set<string>;
  onToggleLike: (song: Song) => Promise<boolean>;
  onPlay: (s: Song) => void;
  onShare: (s: Song) => void;
}) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [remoteSongs, setRemoteSongs] = useState<Song[]>([]);
  const [hasRemoteLoaded, setHasRemoteLoaded] = useState(false);

  useEffect(() => {
    if (!token) return;
    const trimmed = query.trim();
    const effectiveQuery = trimmed.length >= 2 ? trimmed : 'top hits';

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await apiRequest<ApiMusicSearchItem[]>(
          `/music/search?q=${encodeURIComponent(effectiveQuery)}&limit=20`,
          {},
          token
        );
        if (cancelled) return;
        const mapped: Song[] = results.map((item, idx) => ({
          id: 2_000_000 + idx,
          title: trimSongTitle(item.title),
          artist: item.artist,
          cover: item.cover_url || SONGS[idx % SONGS.length].cover,
          duration: item.duration || '—',
          streamUrl: item.stream_url || undefined,
        }));
        setRemoteSongs(mapped);
        setHasRemoteLoaded(true);
      } catch (err) {
        console.warn('YTM search failed', err);
        if (!cancelled) setRemoteSongs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, token]);

  const list = hasRemoteLoaded ? remoteSongs : SONGS;

  return (
    <>
      <div className="search-bar glass-inset">
        <Search size={18} />
        <input
          placeholder="Поиск треков и артистов..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {loading && <div className="search-status">Ищем треки в YouTube Music...</div>}
      {!loading && query.trim().length < 2 && list.length > 0 && (
        <div className="search-status">Популярное из YouTube Music</div>
      )}
      {!loading && list.length === 0 && (
        <div className="search-status">Ничего не найдено</div>
      )}
      <div className="tag-row">
        {TRENDING_TAGS.map(tag => (<button className="tag-chip" key={tag}>{tag}</button>))}
      </div>
      <div className="section-header">
        <h3 className="section-title">В тренде</h3>
        <button className="section-more">Ещё <ChevronRight size={16} /></button>
      </div>
      {list.map((song) => (
        <div className="trending-item" key={song.id}>
          <img src={song.cover} alt="" onClick={() => onPlay(song)} />
          <div className="trending-info" onClick={() => onPlay(song)}>
            <h4>{song.title}</h4>
            <p>{song.artist} · {song.duration}</p>
          </div>
          <motion.button
            className="icon-btn glass-btn-sm"
            onClick={() => void onToggleLike(song)}
            animate={likedTrackKeys.has(trackKeyOfSong(song)) ? { scale: [1, 1.18, 1] } : { scale: 1 }}
            transition={{ duration: 0.28 }}
          >
            <Heart size={16} color={likedTrackKeys.has(trackKeyOfSong(song)) ? 'var(--orange-main)' : 'currentColor'} />
          </motion.button>
          <button className="icon-btn glass-btn-sm" onClick={() => onShare(song)}><Share2 size={16} /></button>
          <button className="play-btn-sm" style={{ width: 32, height: 32 }} onClick={() => onPlay(song)}>
            <Play size={14} fill="#fff" />
          </button>
        </div>
      ))}
    </>
  );
}

/* ========== CHAT LIST ========== */
function ChatListScreen({ threads, onOpenChat }: { threads: ChatThread[]; onOpenChat: (t: ChatThread) => void }) {
  return (
    <>
      <div className="tab-pills">
        <button className="tab-pill active">Все</button>
        <button className="tab-pill">Треками поделились</button>
      </div>
      {threads.map((thread) => {
        const lastMsg = thread.messages[thread.messages.length - 1];
        return (
          <motion.div className="chat-item" key={thread.friend.id} onClick={() => onOpenChat(thread)} whileTap={{ scale: 0.98 }}>
            <div className="chat-avatar-wrap">
              <img src={thread.friend.avatar} alt="" className="chat-avatar" />
              {thread.friend.isOnline && <div className="online-dot" />}
            </div>
            <div className="chat-info">
              <h4>{thread.friend.name}</h4>
              <p>{lastMsg.songShare ? '🎵 Поделился треком' : lastMsg.text}</p>
            </div>
            <div className="chat-meta">
              <span className="chat-time">{lastMsg.time}</span>
              {thread.unread > 0 && <div className="unread-badge">{thread.unread}</div>}
            </div>
          </motion.div>
        );
      })}
    </>
  );
}

/* ========== CHAT DETAIL ========== */
function ChatDetail({ thread, onClose, onPlay }: { thread: ChatThread; onClose: () => void; onPlay: (s: Song) => void }) {
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState(thread.messages);
  const [songPicker, setSongPicker] = useState(false);

  const sendMsg = () => {
    if (!input.trim()) return;
    setMsgs(prev => [...prev, { id: Date.now(), senderId: 0, text: input, time: 'Сейчас' }]);
    setInput('');
  };

  const shareSongInChat = (song: Song) => {
    setMsgs(prev => [...prev, { id: Date.now(), senderId: 0, text: '', time: 'Сейчас', songShare: song }]);
    setSongPicker(false);
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
        {msgs.map((msg) => {
          const isSent = msg.senderId === 0;
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

      {/* Song picker overlay */}
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
            {SONGS.map(song => (
              <motion.div key={song.id} className="song-picker-item" whileTap={{ scale: 0.97 }} onClick={() => shareSongInChat(song)}>
                <img src={song.cover} alt="" />
                <div className="song-picker-info">
                  <h5>{song.title}</h5>
                  <p>{song.artist}</p>
                </div>
                <Send size={16} color="var(--purple-main)" />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="chat-input-bar">
        <button className="icon-btn glass-btn-sm" onClick={() => setSongPicker(true)}>
          <Music size={18} color="var(--purple-main)" />
        </button>
        <input placeholder="Введите сообщение..." value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') sendMsg(); }}
        />
        <button className="send-btn" onClick={sendMsg}><Send size={18} /></button>
      </div>
    </motion.div>
  );
}

/* ========== PROFILE ========== */
function ProfileScreen({
  currentUser,
  stats,
  likedSongs,
  likedTrackKeys,
  onToggleLike,
  onUploadAvatar,
  onUpdateTag,
}: {
  currentUser: ApiUser;
  stats: ApiProfileStats;
  likedSongs: Song[];
  likedTrackKeys: Set<string>;
  onToggleLike: (song: Song) => Promise<boolean>;
  onUploadAvatar: (file: File) => Promise<void>;
  onUpdateTag: (tag: string) => Promise<void>;
}) {
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [tagInput, setTagInput] = useState(currentUser.tag || '');
  const [savingTag, setSavingTag] = useState(false);
  const [tagError, setTagError] = useState('');

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
      setTagError(err instanceof Error ? err.message : 'Не удалось обновить тег');
    } finally {
      setSavingTag(false);
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
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void onUploadAvatar(file);
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
        {tagError && <div className="auth-error" style={{ marginTop: 8 }}>{tagError}</div>}
        <div className="profile-stats">
          <div className="profile-stat"><span className="num">{stats.friends}</span><span className="label">Друзья</span></div>
          <div className="profile-stat"><span className="num">{stats.tracks}</span><span className="label">Треки</span></div>
          <div className="profile-stat"><span className="num">{stats.likes}</span><span className="label">Лайки</span></div>
        </div>
      </div>
      <div className="section-header"><h3 className="section-title">Лайкнутые треки</h3></div>
      {likedSongs.slice(0, 20).map((song) => (
        <div className="trending-item" key={song.id}>
          <img src={song.cover} alt="" />
          <div className="trending-info"><h4>{song.title}</h4><p>{song.artist} · {song.duration}</p></div>
          <motion.button
            className="icon-btn glass-btn-sm"
            onClick={() => void onToggleLike(song)}
            animate={likedTrackKeys.has(trackKeyOfSong(song)) ? { scale: [1, 1.18, 1] } : { scale: 1 }}
            transition={{ duration: 0.28 }}
          >
            <Heart size={18} color={likedTrackKeys.has(trackKeyOfSong(song)) ? 'var(--orange-main)' : 'currentColor'} />
          </motion.button>
        </div>
      ))}
      {likedSongs.length === 0 && <div className="search-status">Пока нет лайков</div>}
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
    <nav className="bottom-nav glass-nav">
      {items.map((item) => {
        const Icon = item.icon;
        const active = tab === item.id;
        return (
          <div key={item.id} className={`nav-item ${active ? 'active' : ''}`} onClick={() => onChangeTab(item.id)}>
            <div className="nav-icon-wrap"><Icon size={22} fill={active ? 'currentColor' : 'none'} /></div>
            <span>{item.label}</span>
          </div>
        );
      })}
    </nav>
  );
}

/* ========== NOW PLAYING FULLSCREEN (with scrollable chat) ========== */
function NowPlayingFull({ song, isPlaying, currentTimeSec, durationSec, isLiked, shuffleOn, repeatMode, listeningWith, onClose, onToggle, onNext, onPrev, onSeek, onToggleLike, onToggleShuffle, onCycleRepeat, currentUserId, sessionActive, sessionMessages, onSendSessionMessage, onShare }: {
  song: Song;
  isPlaying: boolean;
  currentTimeSec: number;
  durationSec: number;
  isLiked: boolean;
  shuffleOn: boolean;
  repeatMode: RepeatMode;
  listeningWith: Friend | null;
  onClose: () => void;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (timeSec: number) => void;
  onToggleLike: () => Promise<boolean>;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  currentUserId: number;
  sessionActive: boolean;
  sessionMessages: ApiSessionMessage[];
  onSendSessionMessage: (text: string) => Promise<void>;
  onShare: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingSeekRef = useRef(false);
  const [micActive, setMicActive] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const sendChat = () => {
    if (!sessionActive || !chatInput.trim()) return;
    void onSendSessionMessage(chatInput.trim());
    setChatInput('');
  };

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
            onClick={() => setMicActive(!micActive)}
          >
            {micActive ? <MicOff size={20} /> : <Mic size={20} />}
            <span>{micActive ? 'Без звука' : 'Говорить'}</span>
          </motion.button>
        </div>

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
    </motion.div>
  );
}
