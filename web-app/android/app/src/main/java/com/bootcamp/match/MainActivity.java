package com.bootcamp.match;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FriendsWidgetPlugin.class);
        registerPlugin(NowPlayingDetectorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
