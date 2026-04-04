package com.bootcamp.match;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.provider.Settings;
import android.text.TextUtils;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "NowPlayingDetector")
public class NowPlayingDetectorPlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(buildSnapshot());
    }

    @PluginMethod
    public void getCurrentTrack(PluginCall call) {
        call.resolve(buildSnapshot());
    }

    @PluginMethod
    public void openAccessSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private JSObject buildSnapshot() {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("platform", "android");

        boolean accessGranted = NotificationManagerCompat
            .getEnabledListenerPackages(context)
            .contains(context.getPackageName());
        result.put("accessGranted", accessGranted);

        if (!accessGranted) {
          result.put("track", null);
          return result;
        }

        result.put("track", resolveCurrentTrack(context));
        return result;
    }

    private JSObject resolveCurrentTrack(Context context) {
        try {
            MediaSessionManager mediaSessionManager =
                (MediaSessionManager) context.getSystemService(Context.MEDIA_SESSION_SERVICE);
            if (mediaSessionManager == null) return null;

            ComponentName listenerComponent = new ComponentName(context, MatchNotificationListenerService.class);
            List<MediaController> sessions = mediaSessionManager.getActiveSessions(listenerComponent);
            MediaController controller = pickBestSession(sessions, context.getPackageName());
            if (controller == null) return null;

            MediaMetadata metadata = controller.getMetadata();
            if (metadata == null) return null;

            String title = readText(metadata,
                MediaMetadata.METADATA_KEY_TITLE,
                MediaMetadata.METADATA_KEY_DISPLAY_TITLE
            );
            if (TextUtils.isEmpty(title)) return null;

            String artist = readText(metadata,
                MediaMetadata.METADATA_KEY_ARTIST,
                MediaMetadata.METADATA_KEY_ALBUM_ARTIST,
                MediaMetadata.METADATA_KEY_AUTHOR
            );
            String album = readText(metadata,
                MediaMetadata.METADATA_KEY_ALBUM
            );

            JSObject track = new JSObject();
            track.put("title", title);
            track.put("artist", artist);
            track.put("album", album);
            track.put("durationMs", metadata.getLong(MediaMetadata.METADATA_KEY_DURATION));
            track.put("packageName", controller.getPackageName());
            track.put("sourceApp", resolveApplicationLabel(context, controller.getPackageName()));

            String coverDataUrl = extractArtwork(metadata);
            if (!TextUtils.isEmpty(coverDataUrl)) {
                track.put("coverDataUrl", coverDataUrl);
            }

            return track;
        } catch (SecurityException ignored) {
            return null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private MediaController pickBestSession(List<MediaController> sessions, String ownPackageName) {
        if (sessions == null || sessions.isEmpty()) return null;

        List<MediaController> eligible = new ArrayList<>();
        for (MediaController controller : sessions) {
            if (controller == null) continue;
            if (ownPackageName.equals(controller.getPackageName())) continue;
            eligible.add(controller);
        }

        MediaController fallback = null;
        for (MediaController controller : eligible) {
            PlaybackState playbackState = controller.getPlaybackState();
            if (playbackState == null) continue;
            int state = playbackState.getState();
            if (isActivePlaybackState(state)) return controller;
            if (fallback == null && hasUsefulMetadata(controller.getMetadata())) {
                fallback = controller;
            }
        }
        return fallback;
    }

    private boolean isActivePlaybackState(int state) {
        return state == PlaybackState.STATE_PLAYING
            || state == PlaybackState.STATE_BUFFERING
            || state == PlaybackState.STATE_FAST_FORWARDING
            || state == PlaybackState.STATE_REWINDING
            || state == PlaybackState.STATE_SKIPPING_TO_NEXT
            || state == PlaybackState.STATE_SKIPPING_TO_PREVIOUS
            || state == PlaybackState.STATE_SKIPPING_TO_QUEUE_ITEM;
    }

    private boolean hasUsefulMetadata(MediaMetadata metadata) {
        return metadata != null && !TextUtils.isEmpty(readText(
            metadata,
            MediaMetadata.METADATA_KEY_TITLE,
            MediaMetadata.METADATA_KEY_DISPLAY_TITLE
        ));
    }

    private String readText(MediaMetadata metadata, String... keys) {
        for (String key : keys) {
            CharSequence value = metadata.getText(key);
            if (!TextUtils.isEmpty(value)) {
                return value.toString().trim();
            }
        }
        return null;
    }

    private String resolveApplicationLabel(Context context, String packageName) {
        try {
            PackageManager pm = context.getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(packageName, 0);
            CharSequence label = pm.getApplicationLabel(info);
            return label != null ? label.toString() : packageName;
        } catch (Exception ignored) {
            return packageName;
        }
    }

    private String extractArtwork(MediaMetadata metadata) {
        String iconUri = readArtworkUri(metadata);
        if (!TextUtils.isEmpty(iconUri)) return iconUri;

        Bitmap bitmap = metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (bitmap == null) bitmap = metadata.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (bitmap == null) bitmap = metadata.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        if (bitmap == null) return null;

        Bitmap scaled = bitmap;
        if (bitmap.getWidth() > 320 || bitmap.getHeight() > 320) {
            float scale = Math.min(320f / bitmap.getWidth(), 320f / bitmap.getHeight());
            int width = Math.max(1, Math.round(bitmap.getWidth() * scale));
            int height = Math.max(1, Math.round(bitmap.getHeight() * scale));
            scaled = Bitmap.createScaledBitmap(bitmap, width, height, true);
        }

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        scaled.compress(Bitmap.CompressFormat.JPEG, 84, output);
        return "data:image/jpeg;base64," + android.util.Base64.encodeToString(output.toByteArray(), android.util.Base64.NO_WRAP);
    }

    private String readArtworkUri(MediaMetadata metadata) {
        String[] keys = {
            MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI,
            MediaMetadata.METADATA_KEY_ALBUM_ART_URI,
            MediaMetadata.METADATA_KEY_ART_URI
        };
        for (String key : keys) {
            CharSequence value = metadata.getText(key);
            if (TextUtils.isEmpty(value)) continue;
            try {
                Uri uri = Uri.parse(value.toString());
                if (uri != null && !TextUtils.isEmpty(uri.toString())) return uri.toString();
            } catch (Exception ignored) {
                // no-op
            }
        }
        return null;
    }
}
