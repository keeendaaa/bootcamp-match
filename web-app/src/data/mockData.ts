export interface Song {
  id: number;
  title: string;
  artist: string;
  cover: string;
  duration: string;
  streamUrl?: string;
}

export interface Friend {
  id: number;
  name: string;
  username: string;
  avatar: string;
  isOnline: boolean;
  isListening: boolean;
  currentSong?: Song;
  lastActive?: string;
}

export interface ChatMessage {
  id: number;
  senderId: number;
  text: string;
  time: string;
  songShare?: Song;
}

export interface ChatThread {
  friend: Friend;
  messages: ChatMessage[];
  unread: number;
}

export const SONGS: Song[] = [
  { id: 1, title: 'Blinding Lights', artist: 'The Weeknd', cover: '/covers/cover1.jpg', duration: '3:20', streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 2, title: 'Levitating', artist: 'Dua Lipa', cover: '/covers/cover2.jpg', duration: '3:23', streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 3, title: 'Peaches', artist: 'Justin Bieber', cover: '/covers/cover3.jpg', duration: '3:18', streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: 4, title: 'Stay', artist: 'The Kid LAROI', cover: '/covers/cover4.jpg', duration: '2:21', streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { id: 5, title: 'Heat Waves', artist: 'Glass Animals', cover: '/covers/cover5.jpg', duration: '3:58', streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { id: 6, title: 'good 4 u', artist: 'Olivia Rodrigo', cover: '/covers/cover6.jpg', duration: '2:58', streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
];

export const FRIENDS: Friend[] = [
  { id: 1, name: 'Даня', username: '@danya', avatar: '/avatars/danya.jpg', isOnline: true, isListening: true, currentSong: SONGS[0] },
  { id: 2, name: 'Олег', username: '@oleg', avatar: '/avatars/oleg.jpg', isOnline: true, isListening: true, currentSong: SONGS[1] },
  { id: 3, name: 'Александр', username: '@aleksandr', avatar: '/avatars/aleksandr.jpg', isOnline: true, isListening: true, currentSong: SONGS[2] },
  { id: 4, name: 'Галя', username: '@galya', avatar: '/avatars/galya.jpg', isOnline: false, isListening: false, currentSong: SONGS[3], lastActive: '5 ч назад' },
];

export const CHAT_THREADS: ChatThread[] = [
  {
    friend: FRIENDS[0], unread: 2,
    messages: [
      { id: 1, senderId: 1, text: 'Слышал этот новый трек?? 🔥', time: '14:30' },
      { id: 2, senderId: 1, text: '', time: '14:31', songShare: SONGS[0] },
      { id: 3, senderId: 0, text: 'Дааа, он очень крутой!', time: '14:35' },
      { id: 4, senderId: 1, text: 'Весь день на повторе 🎧', time: '14:36' },
    ],
  },
  {
    friend: FRIENDS[1], unread: 0,
    messages: [
      { id: 1, senderId: 0, text: 'Зацени это', time: '12:00' },
      { id: 2, senderId: 0, text: '', time: '12:01', songShare: SONGS[1] },
      { id: 3, senderId: 2, text: 'Очень нравится 👑', time: '12:15' },
    ],
  },
  {
    friend: FRIENDS[2], unread: 1,
    messages: [
      { id: 1, senderId: 3, text: 'Привет! Как дела?', time: 'Вчера' },
    ],
  },
];

export const TRENDING_TAGS = ['Поп', 'Рок', 'Хип-хоп', 'R&B', 'Электроника', 'Инди'];
