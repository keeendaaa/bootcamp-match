import { WebPlugin, registerPlugin } from '@capacitor/core';
import type { Friend } from '../data/mockData';
import { buildWidgetDeepLink, buildWidgetWebUrl } from './deepLinks';

const WIDGET_STORAGE_KEY = 'match_friends_widget_snapshot';

export interface WidgetTrackSnapshot {
  id: number;
  title: string;
  artist: string;
  cover: string;
  duration: string;
  streamUrl?: string;
}

export interface WidgetFriendSnapshot {
  id: number;
  name: string;
  username: string;
  avatar: string;
  isListening: boolean;
  lastActive?: string;
  currentSong?: WidgetTrackSnapshot;
}

export interface FeaturedWidgetItem {
  friendId: number;
  friendName: string;
  friendAvatar: string;
  trackId: number;
  title: string;
  artist: string;
  cover: string;
  cta: string;
  deeplink: string;
  webUrl: string;
}

export interface FriendsWidgetSnapshot {
  appName: string;
  currentUserName?: string;
  updatedAt: string;
  friends: WidgetFriendSnapshot[];
  featured?: FeaturedWidgetItem;
}

interface PublishSnapshotOptions {
  snapshot: FriendsWidgetSnapshot;
}

interface FriendsWidgetPlugin {
  publishSnapshot(options: PublishSnapshotOptions): Promise<void>;
}

class FriendsWidgetWeb extends WebPlugin implements FriendsWidgetPlugin {
  async publishSnapshot(options: PublishSnapshotOptions): Promise<void> {
    localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(options.snapshot));
  }
}

export const FriendsWidget = registerPlugin<FriendsWidgetPlugin>('FriendsWidget', {
  web: async () => new FriendsWidgetWeb(),
});

export const buildFriendsWidgetSnapshot = (
  friends: Friend[],
  currentUserName?: string
): FriendsWidgetSnapshot => {
  const normalizedFriends: WidgetFriendSnapshot[] = friends.slice(0, 4).map((friend) => ({
    id: friend.id,
    name: friend.name,
    username: friend.username,
    avatar: friend.avatar,
    isListening: friend.isListening,
    lastActive: friend.lastActive,
    currentSong: friend.currentSong
      ? {
          id: friend.currentSong.id,
          title: friend.currentSong.title,
          artist: friend.currentSong.artist,
          cover: friend.currentSong.cover,
          duration: friend.currentSong.duration,
          streamUrl: friend.currentSong.streamUrl,
        }
      : undefined,
  }));

  const featuredFriend = friends.find((friend) => friend.currentSong) || friends[0];
  const featuredTrack = featuredFriend?.currentSong;

  return {
    appName: 'Match',
    currentUserName,
    updatedAt: new Date().toISOString(),
    friends: normalizedFriends,
    featured: featuredFriend && featuredTrack
      ? {
          friendId: featuredFriend.id,
          friendName: featuredFriend.name,
          friendAvatar: featuredFriend.avatar,
          trackId: featuredTrack.id,
          title: featuredTrack.title,
          artist: featuredTrack.artist,
          cover: featuredTrack.cover,
          cta: `Начать совместное прослушивание с ${featuredFriend.name}?`,
          deeplink: buildWidgetDeepLink({
            friendId: featuredFriend.id,
            trackId: featuredTrack.id,
            autoplay: false,
          }),
          webUrl: buildWidgetWebUrl({
            friendId: featuredFriend.id,
            trackId: featuredTrack.id,
            autoplay: false,
          }),
        }
      : undefined,
  };
};

export const publishFriendsWidgetSnapshot = async (
  friends: Friend[],
  currentUserName?: string
): Promise<void> => {
  const snapshot = buildFriendsWidgetSnapshot(friends, currentUserName);
  await FriendsWidget.publishSnapshot({ snapshot });
};

export const getWidgetSnapshotStorageKey = (): string => WIDGET_STORAGE_KEY;
