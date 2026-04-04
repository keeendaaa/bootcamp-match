# iOS Widget Template

После `npm install` и `npx cap add ios`:

1. Скопируйте `App/FriendsWidgetPlugin.swift` и `App/FriendsWidgetPlugin.m` в `ios/App/App/`.
2. Зарегистрируйте plugin в `ios/App/App/AppDelegate.swift`, если auto-registration не подхватит локальный класс.
3. В Xcode добавьте новый target типа `Widget Extension`.
4. Поместите `Widget/FriendsNowPlayingWidget.swift` в extension target.
5. Включите `App Groups` для app target и widget target с id `group.com.bootcamp.match`.
6. Добавьте URL scheme `matchapp` в `Info > URL Types` для app target.

Что уже сделано:

- JS-часть публикует snapshot в plugin `FriendsWidget.publishSnapshot`.
- Виджет читает этот snapshot из shared `UserDefaults`.
- Тап по виджету открывает `matchapp://widget/open?...`, а React уже умеет разобрать этот deeplink и открыть экран друзей на нужном текущем треке.

Что нужно проверить вручную в Xcode:

- Widget extension membership для Swift файла.
- App Group entitlement на обоих target.
- Bundle identifier виджета, например `com.bootcamp.match.widget`.
