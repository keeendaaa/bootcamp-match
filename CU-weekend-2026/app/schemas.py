from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class AuthRegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    name: str | None = Field(default=None, min_length=1, max_length=64)


class AuthLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class UserPublic(BaseModel):
    id: int
    name: str
    tag: str | None = None
    avatar_url: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    user: UserPublic


class FriendAddRequest(BaseModel):
    friend_name: str = Field(min_length=1, max_length=64)


class SongCreate(BaseModel):
    url: str = Field(min_length=1, max_length=500)
    title: str | None = Field(default=None, max_length=255)
    artist: str | None = Field(default=None, max_length=255)
    cover_url: str | None = Field(default=None, max_length=500)
    stream_url: str | None = Field(default=None, max_length=500)
    duration: str | None = Field(default=None, max_length=32)


class SongPublic(BaseModel):
    id: int
    url: str
    title: str | None = None
    artist: str | None = None
    cover_url: str | None = None
    stream_url: str | None = None
    duration: str | None = None


class NowPlayingUpdate(BaseModel):
    song_id: int


class NowPlayingResponse(BaseModel):
    song: SongPublic | None


class MeResponse(BaseModel):
    id: int
    name: str
    email: str | None = None
    tag: str | None = None
    avatar_url: str | None = None
    now_playing: SongPublic | None


class ProfileStatsResponse(BaseModel):
    friends: int
    tracks: int
    likes: int
    playlists: int


class AvatarUpdateRequest(BaseModel):
    avatar_url: str = Field(min_length=1, max_length=500)


class TagUpdateRequest(BaseModel):
    tag: str = Field(min_length=2, max_length=64)


class LikedTrackUpsert(BaseModel):
    track_key: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=255)
    artist: str = Field(default="", max_length=255)
    cover_url: str | None = Field(default=None, max_length=500)
    stream_url: str | None = Field(default=None, max_length=500)
    source_url: str | None = Field(default=None, max_length=500)
    duration: str | None = Field(default=None, max_length=32)


class LikeToggleResponse(BaseModel):
    liked: bool


class LikedTrackPublic(BaseModel):
    id: int
    track_key: str
    title: str
    artist: str
    cover_url: str | None = None
    stream_url: str | None = None
    source_url: str | None = None
    duration: str | None = None


class MusicSearchItem(BaseModel):
    video_id: str
    title: str
    artist: str
    duration: str | None = None
    cover_url: str | None = None
    source_url: str
    stream_url: str | None = None


class SessionInviteCreate(BaseModel):
    friend_id: int
    song_id: int | None = None
    position_sec: int = 0
    is_playing: bool = False
    as_guest: bool = False


class SessionStateUpdate(BaseModel):
    song_id: int | None = None
    position_sec: int = 0
    is_playing: bool = False


class SessionMessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class SessionMessagePublic(BaseModel):
    id: int
    sender_id: int
    text: str
    created_at: str


class SessionPublic(BaseModel):
    id: int
    host_id: int
    guest_id: int
    status: str
    position_sec: int
    is_playing: bool
    song: SongPublic | None
    updated_at: str | None = None
