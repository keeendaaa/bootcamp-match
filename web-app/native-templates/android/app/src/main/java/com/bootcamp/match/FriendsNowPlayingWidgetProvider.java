package com.bootcamp.match;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONObject;

public class FriendsNowPlayingWidgetProvider extends AppWidgetProvider {
  @Override
  public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
    for (int appWidgetId : appWidgetIds) {
      RemoteViews views = buildViews(context);
      appWidgetManager.updateAppWidget(appWidgetId, views);
    }
  }

  private RemoteViews buildViews(Context context) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.friends_now_playing_widget);
    views.setImageViewResource(R.id.widget_cover, R.drawable.widget_cover_placeholder);
    views.setImageViewResource(R.id.widget_friend_avatar, R.drawable.widget_avatar_placeholder);

    SharedPreferences prefs = context.getSharedPreferences(FriendsWidgetPlugin.PREFS_NAME, Context.MODE_PRIVATE);
    String raw = prefs.getString(FriendsWidgetPlugin.STORAGE_KEY, null);
    String deeplink = "matchapp://widget/open?source=friends-widget";

    if (raw != null) {
      try {
        JSONObject snapshot = new JSONObject(raw);
        JSONObject featured = snapshot.optJSONObject("featured");
        if (featured != null) {
          views.setTextViewText(R.id.widget_title, featured.optString("title", "У друзей новая музыка"));
          views.setTextViewText(R.id.widget_artist, featured.optString("artist", "Match"));
          views.setTextViewText(R.id.widget_cta, featured.optString("cta", "Открыть чат"));
          deeplink = featured.optString("deeplink", deeplink);
        } else {
          views.setTextViewText(R.id.widget_title, "У друзей пока тихо");
          views.setTextViewText(R.id.widget_artist, "Match");
          views.setTextViewText(R.id.widget_cta, "Открыть приложение");
        }
      } catch (Exception ignored) {
        views.setTextViewText(R.id.widget_title, "У друзей новая музыка");
        views.setTextViewText(R.id.widget_artist, "Match");
        views.setTextViewText(R.id.widget_cta, "Открыть приложение");
      }
    } else {
      views.setTextViewText(R.id.widget_title, "У друзей пока тихо");
      views.setTextViewText(R.id.widget_artist, "Match");
      views.setTextViewText(R.id.widget_cta, "Открыть приложение");
    }

    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(deeplink));
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent pendingIntent = PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
    return views;
  }
}
