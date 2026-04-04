package com.bootcamp.match;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FriendsWidget")
public class FriendsWidgetPlugin extends Plugin {
    public static final String PREFS_NAME = "match_friends_widget";
    public static final String STORAGE_KEY = "match_friends_widget_snapshot";

    @PluginMethod
    public void publishSnapshot(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        if (snapshot == null) {
            call.reject("snapshot payload is required");
            return;
        }

        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(STORAGE_KEY, snapshot.toString()).apply();

        Intent intent = new Intent(context, FriendsNowPlayingWidgetProvider.class);
        intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        int[] ids = AppWidgetManager.getInstance(context).getAppWidgetIds(
            new ComponentName(context, FriendsNowPlayingWidgetProvider.class)
        );
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(intent);

        call.resolve();
    }
}
