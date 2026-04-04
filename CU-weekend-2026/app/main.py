import os
import re
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree as ET
from urllib.parse import urlparse

import jwt
from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
import requests
from sqlalchemy.orm import Session
import yt_dlp
from ytmusicapi import YTMusic

from .auth import create_access_token, get_current_user, hash_password, verify_password
from .db import get_db
from .db import settings
from .models import DirectMessage, Friendship, LikedTrack, ListenMessage, ListenSession, Song, User
from .schemas import (
    AuthLoginRequest,
    AuthRegisterRequest,
    AvatarUpdateRequest,
    DirectMessageCreate,
    DirectMessagePublic,
    DirectMessageSongPayload,
    DirectThreadPublic,
    FriendAddRequest,
    LikedTrackPublic,
    LikedTrackUpsert,
    LikeToggleResponse,
    MusicSearchItem,
    PodcastSearchItem,
    NowPlayingResponse,
    NowPlayingUpdate,
    MeResponse,
    ProfileStatsResponse,
    SongCreate,
    SessionInviteCreate,
    SessionMessageCreate,
    SessionMessagePublic,
    SessionPublic,
    SessionStateUpdate,
    SongPublic,
    TagUpdateRequest,
    TokenResponse,
    UserPublic,
)

app = FastAPI(title="CU Weekend MVP API")
ytmusic = YTMusic()
STREAM_CACHE: dict[str, tuple[str, dict[str, str]]] = {}
PODCAST_STREAM_CACHE: dict[str, str] = {}
NOW_PLAYING_TTL_SECONDS = 40
VOICE_WS_CONNECTIONS: dict[int, dict[int, set[WebSocket]]] = {}
PODCAST_PROXY_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "*/*",
}

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def normalize_tag(raw: str) -> str:
    tag = raw.strip().lower()
    if tag.startswith("@"):
        tag = tag[1:]
    tag = re.sub(r"[^a-z0-9_]+", "_", tag)
    tag = re.sub(r"_+", "_", tag).strip("_")
    return tag


def create_tag_seed(name: str, email: str) -> str:
    local = email.split("@", 1)[0].strip()
    base = normalize_tag(local) or normalize_tag(name) or "user"
    return base


def build_uploaded_song_filename(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    clean_ext = re.sub(r"[^a-z0-9.]+", "", ext)
    if clean_ext and not clean_ext.startswith("."):
        clean_ext = f".{clean_ext}"
    return f"track-{uuid.uuid4().hex}{clean_ext}"


def title_from_filename(filename: str) -> str | None:
    title = os.path.splitext(os.path.basename(filename))[0].strip()
    if not title:
        return None
    return title[:255]


def ensure_unique_tag(db: Session, base: str, exclude_user_id: int | None = None) -> str:
    cleaned = normalize_tag(base) or "user"
    candidate = cleaned
    suffix = 1
    while True:
        query = db.query(User).filter(User.tag == candidate)
        if exclude_user_id is not None:
            query = query.filter(User.id != exclude_user_id)
        if not query.first():
            return candidate
        suffix += 1
        candidate = f"{cleaned}{suffix}"


def user_to_public(user: User) -> UserPublic:
    return UserPublic(id=user.id, name=user.name, tag=user.tag, avatar_url=user.avatar_url)


def song_to_public(song: Song) -> SongPublic:
    return SongPublic(
        id=song.id,
        url=song.url,
        title=song.title,
        artist=song.artist,
        cover_url=song.cover_url,
        stream_url=song.stream_url,
        duration=song.duration,
    )


def is_friend(db: Session, user_id: int, other_id: int) -> bool:
    if user_id == other_id:
        return False
    return (
        db.query(Friendship)
        .filter(Friendship.user_id == user_id, Friendship.friend_id == other_id)
        .first()
        is not None
    )


def session_to_public(session: ListenSession, db: Session) -> SessionPublic:
    song = None
    if session.song_id:
        song_obj = db.query(Song).filter(Song.id == session.song_id).first()
        if song_obj:
            song = song_to_public(song_obj)
    updated_at = session.updated_at.replace(tzinfo=timezone.utc).isoformat() if session.updated_at else None
    return SessionPublic(
        id=session.id,
        host_id=session.host_id,
        guest_id=session.guest_id,
        status=session.status,
        position_sec=session.position_sec,
        is_playing=session.is_playing,
        song=song,
        updated_at=updated_at,
    )


def direct_message_to_public(message: DirectMessage) -> DirectMessagePublic:
    created_at = message.created_at.replace(tzinfo=timezone.utc).isoformat() if message.created_at else ""
    song_payload = None
    if message.song_title:
        song_payload = DirectMessageSongPayload(
            title=message.song_title,
            artist=message.song_artist,
            cover_url=message.song_cover_url,
            stream_url=message.song_stream_url,
            duration=message.song_duration,
        )
    return DirectMessagePublic(
        id=message.id,
        sender_id=message.sender_id,
        recipient_id=message.recipient_id,
        text=message.text,
        song=song_payload,
        created_at=created_at,
    )


def get_user_from_ws_token(token: str, db: Session) -> User | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = int(payload.get("sub"))
    except Exception:
        return None
    return db.query(User).filter(User.id == user_id).first()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.websocket("/listen/{session_id}/voice-signal/ws")
async def voice_signal_ws(websocket: WebSocket, session_id: int, token: str = Query(default="")) -> None:
    db_gen = get_db()
    db = next(db_gen)
    user = get_user_from_ws_token(token, db) if token else None
    if not user:
        await websocket.close(code=1008)
        db_gen.close()
        return

    session = (
        db.query(ListenSession)
        .filter(ListenSession.id == session_id, ListenSession.status == "accepted")
        .first()
    )
    if not session:
        await websocket.close(code=1008)
        db_gen.close()
        return
    if user.id not in (session.host_id, session.guest_id):
        await websocket.close(code=1008)
        db_gen.close()
        return

    await websocket.accept()
    room = VOICE_WS_CONNECTIONS.setdefault(session_id, {})
    room.setdefault(user.id, set()).add(websocket)
    peer_ids = [session.host_id, session.guest_id]
    peer_ids = [uid for uid in peer_ids if uid != user.id]

    try:
        while True:
            payload = await websocket.receive_json()
            message = {
                "from_user_id": user.id,
                "session_id": session_id,
                "data": payload,
            }
            for peer_id in peer_ids:
                for peer_ws in list(room.get(peer_id, set())):
                    try:
                        await peer_ws.send_json(message)
                    except Exception:
                        room.get(peer_id, set()).discard(peer_ws)
    except WebSocketDisconnect:
        pass
    finally:
        room.get(user.id, set()).discard(websocket)
        if user.id in room and not room[user.id]:
            room.pop(user.id, None)
        if not room:
            VOICE_WS_CONNECTIONS.pop(session_id, None)
        db_gen.close()


@app.get("/music/search", response_model=list[MusicSearchItem])
def search_music(
    q: str = Query(min_length=2, max_length=120),
    limit: int = Query(default=10, ge=1, le=20),
) -> list[MusicSearchItem]:
    results = ytmusic.search(q, filter="songs", limit=limit) or []
    items: list[MusicSearchItem] = []

    for row in results:
        video_id = row.get("videoId")
        if not video_id:
            continue

        artists = row.get("artists") or []
        artist_name = "Unknown Artist"
        if artists and isinstance(artists[0], dict):
            artist_name = artists[0].get("name") or artist_name

        thumbnails = row.get("thumbnails") or []
        cover_url = thumbnails[-1].get("url") if thumbnails and isinstance(thumbnails[-1], dict) else None

        items.append(
            MusicSearchItem(
                video_id=video_id,
                title=row.get("title") or f"Track {video_id}",
                artist=artist_name,
                duration=row.get("duration"),
                cover_url=cover_url,
                source_url=f"https://music.youtube.com/watch?v={video_id}",
                stream_url=f"/music/stream/{video_id}",
            )
        )

    return items[:limit]


def resolve_stream(video_id: str) -> tuple[str, dict[str, str]]:
    cached = STREAM_CACHE.get(video_id)
    if cached:
        return cached
    ydl_opts = {
        # Prefer broadly supported AAC/M4A audio (works in Safari/iOS), then fallback.
        "format": "bestaudio[ext=m4a]/bestaudio[acodec*=mp4a]/bestaudio/best",
        "quiet": True,
        "noplaylist": True,
        "no_warnings": True,
    }
    source = f"https://music.youtube.com/watch?v={video_id}"
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(source, download=False)
            stream_url = info.get("url")
            if not stream_url:
                raise HTTPException(status_code=404, detail="Stream URL not found")
            stream_headers = {
                str(k): str(v)
                for k, v in (info.get("http_headers") or {}).items()
                if k and v
            }
            STREAM_CACHE[video_id] = (stream_url, stream_headers)
            return stream_url, stream_headers
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to resolve stream: {exc}")


def parse_episode_audio(feed_url: str) -> tuple[str | None, str | None]:
    try:
        resp = requests.get(feed_url, timeout=12)
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
    except Exception:
        return None, None

    for item in root.findall(".//item"):
        enclosure = item.find("enclosure")
        if enclosure is None:
            continue
        audio_url = enclosure.get("url")
        if not audio_url:
            continue
        if audio_url.startswith("http://") or audio_url.startswith("https://"):
            duration_raw = item.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}duration")
            return audio_url, (duration_raw.strip() if duration_raw else None)
    return None, None


@app.get("/music/stream/{video_id}")
def stream_music(
    video_id: str,
    request: Request,
) -> StreamingResponse:
    stream_url, base_headers = resolve_stream(video_id)
    proxy_headers = dict(base_headers)
    range_header = request.headers.get("range")
    if range_header:
        proxy_headers["Range"] = range_header

    upstream = requests.get(stream_url, headers=proxy_headers, stream=True, timeout=30)
    if upstream.status_code >= 400:
        STREAM_CACHE.pop(video_id, None)
        stream_url, base_headers = resolve_stream(video_id)
        proxy_headers = dict(base_headers)
        if range_header:
            proxy_headers["Range"] = range_header
        upstream = requests.get(stream_url, headers=proxy_headers, stream=True, timeout=30)

    if upstream.status_code >= 400:
        detail = f"Upstream stream error: {upstream.status_code}"
        raise HTTPException(status_code=502, detail=detail)

    passthrough = {}
    for key in ("Content-Length", "Content-Range", "Accept-Ranges"):
        value = upstream.headers.get(key)
        if value:
            passthrough[key] = value

    media_type = upstream.headers.get("Content-Type", "audio/mpeg")

    def iter_chunks():
        try:
            for chunk in upstream.iter_content(chunk_size=1024 * 64):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    return StreamingResponse(
        iter_chunks(),
        status_code=upstream.status_code,
        media_type=media_type,
        headers=passthrough,
    )


@app.get("/podcasts/search", response_model=list[PodcastSearchItem])
def search_podcasts(
    q: str = Query(min_length=2, max_length=120),
    limit: int = Query(default=10, ge=1, le=20),
) -> list[PodcastSearchItem]:
    endpoint = (
        "https://itunes.apple.com/search"
        f"?term={q}&entity=podcast&limit={limit}&country=US"
    )
    try:
        resp = requests.get(endpoint, timeout=15)
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Podcast search failed: {exc}")

    results = payload.get("results") or []
    items: list[PodcastSearchItem] = []
    for row in results:
        feed_url = row.get("feedUrl")
        if not feed_url:
            continue
        audio_url, episode_duration = parse_episode_audio(feed_url)
        if not audio_url:
            continue

        stream_id = uuid.uuid4().hex
        PODCAST_STREAM_CACHE[stream_id] = audio_url
        episode_count = row.get("trackCount")
        duration_label = episode_duration or (f"Эпизодов: {episode_count}" if episode_count else "Подкаст")

        items.append(
            PodcastSearchItem(
                podcast_id=str(row.get("trackId") or stream_id),
                title=row.get("trackName") or row.get("collectionName") or "Podcast",
                artist=row.get("artistName") or "Podcast",
                duration=duration_label,
                cover_url=row.get("artworkUrl600") or row.get("artworkUrl100"),
                source_url=row.get("trackViewUrl") or row.get("collectionViewUrl"),
                stream_url=f"/podcasts/stream/{stream_id}",
            )
        )
        if len(items) >= limit:
            break

    return items


@app.get("/podcasts/stream/{stream_id}")
def stream_podcast(
    stream_id: str,
    request: Request,
) -> StreamingResponse:
    target_url = PODCAST_STREAM_CACHE.get(stream_id)
    if not target_url:
        raise HTTPException(status_code=404, detail="Podcast stream not found")

    parsed = urlparse(target_url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Unsupported podcast stream URL")

    headers: dict[str, str] = {}
    headers.update(PODCAST_PROXY_HEADERS)
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    upstream = requests.get(target_url, headers=headers, stream=True, timeout=30)
    if upstream.status_code == 403 and range_header:
        upstream.close()
        headers.pop("Range", None)
        upstream = requests.get(target_url, headers=headers, stream=True, timeout=30)
    if upstream.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Upstream podcast stream error: {upstream.status_code}")

    passthrough = {}
    for key in ("Content-Length", "Content-Range", "Accept-Ranges"):
        value = upstream.headers.get(key)
        if value:
            passthrough[key] = value

    media_type = upstream.headers.get("Content-Type", "audio/mpeg")

    def iter_chunks():
        try:
            for chunk in upstream.iter_content(chunk_size=1024 * 64):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    return StreamingResponse(
        iter_chunks(),
        status_code=upstream.status_code,
        media_type=media_type,
        headers=passthrough,
    )

@app.get("/me", response_model=MeResponse)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeResponse:
    song = None
    if current_user.now_playing_song_id:
        song_obj = db.query(Song).filter(Song.id == current_user.now_playing_song_id).first()
        if song_obj:
            song = song_to_public(song_obj)
    return MeResponse(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        tag=current_user.tag,
        avatar_url=current_user.avatar_url,
        now_playing=song,
    )


@app.post("/auth/register", response_model=TokenResponse)
def register(payload: AuthRegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.strip().lower()
    existing_email = db.query(User).filter(User.email == email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")

    if payload.name:
        existing_name = db.query(User).filter(User.name == payload.name).first()
        if existing_name:
            raise HTTPException(status_code=400, detail="Name already exists")
        name = payload.name
    else:
        name = email.split("@", 1)[0][:64]
        if not name:
            name = "user"
        candidate = name
        i = 1
        while db.query(User).filter(User.name == candidate).first():
            i += 1
            candidate = f"{name[:56]}{i}"
        name = candidate

    tag = ensure_unique_tag(db, create_tag_seed(name, email))
    user = User(
        name=name,
        email=email,
        password_hash=hash_password(payload.password),
        tag=tag,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user)
    return TokenResponse(access_token=token, user=user_to_public(user))


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: AuthLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user)
    return TokenResponse(access_token=token, user=user_to_public(user))


@app.post("/friends", response_model=UserPublic)
def add_friend(
    payload: FriendAddRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPublic:
    raw = payload.friend_name.strip()
    if not raw.startswith("@"):
        raise HTTPException(status_code=400, detail="Use @tag to add friends")
    normalized = normalize_tag(raw)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid tag")
    friend = db.query(User).filter(User.tag == normalized).first()
    if not friend:
        raise HTTPException(status_code=404, detail="Friend not found")
    if friend.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot add yourself")

    existing_forward = (
        db.query(Friendship)
        .filter(Friendship.user_id == current_user.id)
        .filter(Friendship.friend_id == friend.id)
        .first()
    )
    existing_reverse = (
        db.query(Friendship)
        .filter(Friendship.user_id == friend.id)
        .filter(Friendship.friend_id == current_user.id)
        .first()
    )

    to_add = []
    if not existing_forward:
        to_add.append(Friendship(user_id=current_user.id, friend_id=friend.id))
    if not existing_reverse:
        to_add.append(Friendship(user_id=friend.id, friend_id=current_user.id))
    if to_add:
        db.add_all(to_add)
        db.commit()

    return user_to_public(friend)


@app.get("/users/search", response_model=list[UserPublic])
def search_users(
    q: str = Query(min_length=2, max_length=64),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserPublic]:
    normalized = normalize_tag(q)
    if not normalized:
        return []

    friend_ids = (
        db.query(Friendship.friend_id)
        .filter(Friendship.user_id == current_user.id)
        .subquery()
    )

    users = (
        db.query(User)
        .filter(User.id != current_user.id)
        .filter(User.id.not_in(friend_ids))
        .filter(User.tag.is_not(None))
        .filter(User.tag.ilike(f"{normalized}%"))
        .order_by(User.tag.asc())
        .limit(10)
        .all()
    )
    return [user_to_public(user) for user in users]


@app.get("/friends", response_model=list[UserPublic])
def list_friends(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserPublic]:
    friend_ids = (
        db.query(Friendship.friend_id)
        .filter(Friendship.user_id == current_user.id)
        .all()
    )
    ids = [row[0] for row in friend_ids]
    if not ids:
        return []

    friends = db.query(User).filter(User.id.in_(ids)).order_by(User.name).all()
    return [user_to_public(friend) for friend in friends]


@app.get("/chats/threads", response_model=list[DirectThreadPublic])
def list_direct_threads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DirectThreadPublic]:
    friend_rows = (
        db.query(User)
        .join(Friendship, Friendship.friend_id == User.id)
        .filter(Friendship.user_id == current_user.id)
        .order_by(User.name.asc())
        .all()
    )
    if not friend_rows:
        return []

    threads: list[DirectThreadPublic] = []
    for friend in friend_rows:
        last_message = (
            db.query(DirectMessage)
            .filter(
                (
                    (DirectMessage.sender_id == current_user.id)
                    & (DirectMessage.recipient_id == friend.id)
                )
                | (
                    (DirectMessage.sender_id == friend.id)
                    & (DirectMessage.recipient_id == current_user.id)
                )
            )
            .order_by(DirectMessage.id.desc())
            .first()
        )
        unread = (
            db.query(DirectMessage)
            .filter(DirectMessage.sender_id == friend.id, DirectMessage.recipient_id == current_user.id)
            .count()
        )
        threads.append(
            DirectThreadPublic(
                friend=user_to_public(friend),
                last_message=direct_message_to_public(last_message) if last_message else None,
                unread=unread,
            )
        )
    return threads


@app.get("/chats/{friend_id}/messages", response_model=list[DirectMessagePublic])
def list_direct_messages(
    friend_id: int,
    after_id: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DirectMessagePublic]:
    if not is_friend(db, current_user.id, friend_id):
        raise HTTPException(status_code=403, detail="Not friends")

    messages = (
        db.query(DirectMessage)
        .filter(
            (
                (DirectMessage.sender_id == current_user.id)
                & (DirectMessage.recipient_id == friend_id)
            )
            | (
                (DirectMessage.sender_id == friend_id)
                & (DirectMessage.recipient_id == current_user.id)
            )
        )
        .filter(DirectMessage.id > after_id)
        .order_by(DirectMessage.id.asc())
        .all()
    )
    return [direct_message_to_public(message) for message in messages]


@app.post("/chats/{friend_id}/messages", response_model=DirectMessagePublic)
def send_direct_message(
    friend_id: int,
    payload: DirectMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DirectMessagePublic:
    if not is_friend(db, current_user.id, friend_id):
        raise HTTPException(status_code=403, detail="Not friends")

    text = (payload.text or "").strip()
    song = payload.song
    if not text and not song:
        raise HTTPException(status_code=400, detail="Message text or song is required")
    if song and not text:
        text = f'🎵 {song.title}'

    message = DirectMessage(
        sender_id=current_user.id,
        recipient_id=friend_id,
        text=text,
        song_title=song.title if song else None,
        song_artist=song.artist if song else None,
        song_cover_url=song.cover_url if song else None,
        song_stream_url=song.stream_url if song else None,
        song_duration=song.duration if song else None,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return direct_message_to_public(message)


@app.get("/me/stats", response_model=ProfileStatsResponse)
def get_profile_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileStatsResponse:
    friends_count = db.query(Friendship).filter(Friendship.user_id == current_user.id).count()
    tracks_count = db.query(Song).filter(Song.user_id == current_user.id).count()
    likes_count = db.query(LikedTrack).filter(LikedTrack.user_id == current_user.id).count()
    return ProfileStatsResponse(
        friends=friends_count,
        tracks=tracks_count,
        likes=likes_count,
        playlists=0,
    )


@app.put("/me/avatar", response_model=UserPublic)
def update_avatar_url(
    payload: AvatarUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPublic:
    current_user.avatar_url = payload.avatar_url
    db.commit()
    return user_to_public(current_user)


@app.post("/me/avatar/upload", response_model=UserPublic)
def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPublic:
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=400, detail="Unsupported avatar format")

    avatar_name = f"avatar-{current_user.id}-{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, avatar_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    current_user.avatar_url = f"{request.url.scheme}://{request.url.netloc}/api/files/{avatar_name}"
    db.commit()
    return user_to_public(current_user)


@app.put("/me/tag", response_model=UserPublic)
def update_my_tag(
    payload: TagUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPublic:
    cleaned = normalize_tag(payload.tag)
    if len(cleaned) < 2:
        raise HTTPException(status_code=400, detail="Tag is too short")
    current_user.tag = ensure_unique_tag(db, cleaned, exclude_user_id=current_user.id)
    db.commit()
    return user_to_public(current_user)


@app.get("/users/by-tag/{tag}", response_model=UserPublic)
def get_user_by_tag(
    tag: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPublic:
    cleaned = normalize_tag(tag)
    user = db.query(User).filter(User.tag == cleaned).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user_to_public(user)


@app.get("/me/likes", response_model=list[LikedTrackPublic])
def list_my_likes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LikedTrackPublic]:
    likes = (
        db.query(LikedTrack)
        .filter(LikedTrack.user_id == current_user.id)
        .order_by(LikedTrack.created_at.desc(), LikedTrack.id.desc())
        .all()
    )
    return [
        LikedTrackPublic(
            id=like.id,
            track_key=like.track_key,
            title=like.title,
            artist=like.artist,
            cover_url=like.cover_url,
            stream_url=like.stream_url,
            source_url=like.source_url,
            duration=like.duration,
        )
        for like in likes
    ]


@app.get("/me/songs", response_model=list[SongPublic])
def list_my_songs(
    uploaded_only: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SongPublic]:
    query = (
        db.query(Song)
        .filter(Song.user_id == current_user.id)
    )

    if uploaded_only:
        query = query.filter(Song.url.contains("/files/"))

    songs = query.order_by(Song.id.desc()).all()
    return [song_to_public(song) for song in songs]


@app.post("/me/likes/toggle", response_model=LikeToggleResponse)
def toggle_like(
    payload: LikedTrackUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LikeToggleResponse:
    existing = (
        db.query(LikedTrack)
        .filter(LikedTrack.user_id == current_user.id)
        .filter(LikedTrack.track_key == payload.track_key)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        return LikeToggleResponse(liked=False)

    item = LikedTrack(
        user_id=current_user.id,
        track_key=payload.track_key,
        title=payload.title,
        artist=payload.artist,
        cover_url=payload.cover_url,
        stream_url=payload.stream_url,
        source_url=payload.source_url,
        duration=payload.duration,
    )
    db.add(item)
    db.commit()
    return LikeToggleResponse(liked=True)


@app.post("/songs", response_model=SongPublic)
def add_song(
    payload: SongCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SongPublic:
    parsed = urlparse(payload.url)
    filename = os.path.basename(parsed.path)
    song = Song(
        user_id=current_user.id,
        url=payload.url,
        title=payload.title,
        artist=payload.artist,
        cover_url=payload.cover_url,
        stream_url=payload.stream_url,
        duration=payload.duration,
        filename=filename,
    )
    db.add(song)
    db.commit()
    db.refresh(song)

    return song_to_public(song)


@app.post("/songs/upload", response_model=SongPublic)
def upload_song(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SongPublic:
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    original_filename = os.path.basename(file.filename)
    if not original_filename:
        raise HTTPException(status_code=400, detail="Invalid file name")
    stored_filename = build_uploaded_song_filename(original_filename)
    file_path = os.path.join(UPLOAD_DIR, stored_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    url = f"/files/{stored_filename}"
    song = Song(
        user_id=current_user.id,
        url=url,
        title=title_from_filename(original_filename),
        filename=stored_filename,
    )
    db.add(song)
    db.commit()
    db.refresh(song)

    return song_to_public(song)


@app.get("/files/{filename}")
def get_file(filename: str) -> FileResponse:
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)


@app.get("/friends/{friend_id}/songs", response_model=list[SongPublic])
def list_friend_songs(
    friend_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SongPublic]:
    is_friend = (
        db.query(Friendship)
        .filter(Friendship.user_id == current_user.id)
        .filter(Friendship.friend_id == friend_id)
        .first()
    )
    if not is_friend:
        raise HTTPException(status_code=403, detail="Not friends")

    songs = (
        db.query(Song)
        .filter(Song.user_id == friend_id)
        .order_by(Song.id.desc())
        .all()
    )
    return [
        song_to_public(song)
        for song in songs
    ]


@app.put("/me/now-playing", response_model=SongPublic)
def update_now_playing(
    payload: NowPlayingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SongPublic:
    song = (
        db.query(Song)
        .filter(Song.id == payload.song_id)
        .filter(Song.user_id == current_user.id)
        .first()
    )
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    current_user.now_playing_song_id = song.id
    current_user.now_playing_updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(song)

    return song_to_public(song)


@app.delete("/me/now-playing")
def clear_now_playing(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    current_user.now_playing_song_id = None
    current_user.now_playing_updated_at = None
    db.commit()
    return {"ok": True}


@app.post("/me/now-playing/heartbeat")
def touch_now_playing(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not current_user.now_playing_song_id:
        return {"ok": False}
    current_user.now_playing_updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {"ok": True}


@app.get("/friends/{friend_id}/now-playing", response_model=NowPlayingResponse)
def get_friend_now_playing(
    friend_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NowPlayingResponse:
    is_friend = (
        db.query(Friendship)
        .filter(Friendship.user_id == current_user.id)
        .filter(Friendship.friend_id == friend_id)
        .first()
    )
    if not is_friend:
        raise HTTPException(status_code=403, detail="Not friends")

    friend = db.query(User).filter(User.id == friend_id).first()
    if not friend:
        raise HTTPException(status_code=404, detail="Friend not found")

    if not friend.now_playing_song_id:
        return NowPlayingResponse(song=None)

    last_touch = friend.now_playing_updated_at
    is_stale = (
        last_touch is None
        or (datetime.now(timezone.utc).replace(tzinfo=None) - last_touch) > timedelta(seconds=NOW_PLAYING_TTL_SECONDS)
    )
    if is_stale:
        friend.now_playing_song_id = None
        friend.now_playing_updated_at = None
        db.commit()
        return NowPlayingResponse(song=None)

    song = db.query(Song).filter(Song.id == friend.now_playing_song_id).first()
    if not song:
        return NowPlayingResponse(song=None)

    return NowPlayingResponse(
        song=song_to_public(song)
    )


@app.post("/listen/invite", response_model=SessionPublic)
def create_listen_invite(
    payload: SessionInviteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionPublic:
    if not is_friend(db, current_user.id, payload.friend_id):
        raise HTTPException(status_code=403, detail="Not friends")

    host_id = payload.friend_id if payload.as_guest else current_user.id
    guest_id = current_user.id if payload.as_guest else payload.friend_id
    initial_status = "active" if payload.as_guest else "pending"

    existing = (
        db.query(ListenSession)
        .filter(ListenSession.host_id == host_id)
        .filter(ListenSession.guest_id == guest_id)
        .filter(ListenSession.status.in_(["pending", "active"]))
        .order_by(ListenSession.id.desc())
        .first()
    )
    if existing:
        existing.song_id = payload.song_id
        existing.position_sec = max(0, int(payload.position_sec))
        existing.is_playing = payload.is_playing
        if payload.as_guest:
            existing.status = "active"
        db.commit()
        db.refresh(existing)
        return session_to_public(existing, db)

    session = ListenSession(
        host_id=host_id,
        guest_id=guest_id,
        song_id=payload.song_id,
        status=initial_status,
        position_sec=max(0, int(payload.position_sec)),
        is_playing=payload.is_playing,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session_to_public(session, db)


@app.get("/listen/incoming", response_model=list[SessionPublic])
def list_incoming_invites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SessionPublic]:
    sessions = (
        db.query(ListenSession)
        .filter(ListenSession.guest_id == current_user.id, ListenSession.status == "pending")
        .order_by(ListenSession.id.desc())
        .all()
    )
    return [session_to_public(item, db) for item in sessions]


@app.get("/listen/active", response_model=SessionPublic | None)
def get_active_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionPublic | None:
    session = (
        db.query(ListenSession)
        .filter(
            ((ListenSession.host_id == current_user.id) | (ListenSession.guest_id == current_user.id)),
            ListenSession.status == "active",
        )
        .order_by(ListenSession.id.desc())
        .first()
    )
    if not session:
        return None
    return session_to_public(session, db)


@app.post("/listen/{session_id}/accept", response_model=SessionPublic)
def accept_invite(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionPublic:
    session = db.query(ListenSession).filter(ListenSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.guest_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if session.status == "ended":
        raise HTTPException(status_code=400, detail="Session already ended")
    session.status = "active"
    db.commit()
    db.refresh(session)
    return session_to_public(session, db)


@app.post("/listen/{session_id}/end", response_model=SessionPublic)
def end_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionPublic:
    session = db.query(ListenSession).filter(ListenSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.id not in {session.host_id, session.guest_id}:
        raise HTTPException(status_code=403, detail="Forbidden")
    session.status = "ended"
    db.commit()
    db.refresh(session)
    return session_to_public(session, db)


@app.put("/listen/{session_id}/state", response_model=SessionPublic)
def update_session_state(
    session_id: int,
    payload: SessionStateUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionPublic:
    session = db.query(ListenSession).filter(ListenSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.id not in {session.host_id, session.guest_id}:
        raise HTTPException(status_code=403, detail="Forbidden")
    if session.status == "ended":
        raise HTTPException(status_code=400, detail="Session ended")

    session.song_id = payload.song_id
    session.position_sec = max(0, int(payload.position_sec))
    session.is_playing = payload.is_playing
    db.commit()
    db.refresh(session)
    return session_to_public(session, db)


@app.get("/listen/{session_id}/messages", response_model=list[SessionMessagePublic])
def list_session_messages(
    session_id: int,
    after_id: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SessionMessagePublic]:
    session = db.query(ListenSession).filter(ListenSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.id not in {session.host_id, session.guest_id}:
        raise HTTPException(status_code=403, detail="Forbidden")

    messages = (
        db.query(ListenMessage)
        .filter(ListenMessage.session_id == session_id, ListenMessage.id > after_id)
        .order_by(ListenMessage.id.asc())
        .all()
    )
    out: list[SessionMessagePublic] = []
    for msg in messages:
        created_at = msg.created_at.replace(tzinfo=timezone.utc).isoformat() if msg.created_at else ""
        out.append(SessionMessagePublic(id=msg.id, sender_id=msg.sender_id, text=msg.text, created_at=created_at))
    return out


@app.post("/listen/{session_id}/messages", response_model=SessionMessagePublic)
def send_session_message(
    session_id: int,
    payload: SessionMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionMessagePublic:
    session = db.query(ListenSession).filter(ListenSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.id not in {session.host_id, session.guest_id}:
        raise HTTPException(status_code=403, detail="Forbidden")
    if session.status == "ended":
        raise HTTPException(status_code=400, detail="Session ended")

    msg = ListenMessage(session_id=session_id, sender_id=current_user.id, text=payload.text.strip())
    db.add(msg)
    db.commit()
    db.refresh(msg)
    created_at = msg.created_at.replace(tzinfo=timezone.utc).isoformat() if msg.created_at else ""
    return SessionMessagePublic(id=msg.id, sender_id=msg.sender_id, text=msg.text, created_at=created_at)
