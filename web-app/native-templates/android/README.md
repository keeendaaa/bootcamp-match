# Android Widget Template

После `npm install` и `npx cap add android`:

1. Скопируйте `app/src/main/java/com/bootcamp/match/FriendsWidgetPlugin.java` в `android/app/src/main/java/com/bootcamp/match/`.
2. Скопируйте `FriendsNowPlayingWidgetProvider.java` туда же.
3. Скопируйте ресурсы из `app/src/main/res/` в соответствующие папки Android проекта.
4. Зарегистрируйте plugin и widget provider в `android/app/src/main/AndroidManifest.xml`.
5. Добавьте intent filter для deeplink scheme `matchapp`.

Manifest fragments:

```xml
<receiver
  android:name=".FriendsNowPlayingWidgetProvider"
  android:exported="false">
  <intent-filter>
    <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
  </intent-filter>
  <meta-data
    android:name="android.appwidget.provider"
    android:resource="@xml/friends_now_playing_widget_info" />
</receiver>
```

```xml
<activity
  android:name=".MainActivity"
  android:exported="true">
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="matchapp" android:host="widget" />
  </intent-filter>
</activity>
```

Важно:

- Этот шаблон уже открывает React-приложение по deeplink'у и передает friend/track context.
- Для Android artwork и avatar пока идут как placeholders. Если нужен live remote artwork в home widget, следующим шагом лучше переходить на Glance + фоновые image-cache jobs.
