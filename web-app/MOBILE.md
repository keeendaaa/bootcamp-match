# Mobile WebView + Widget Plan

## Что выбрано

Лучший путь для этого проекта:

1. Оставить текущий Vite/React/TypeScript как основной UI.
2. Поднять мобильное приложение как тонкий WebView-shell через Capacitor.
3. Внутри shell показывать тот же web bundle, без переписывания экранов на нативный UI.
4. Делать home-screen widget нативно, потому что сам виджет через WebView не реализуется.
5. Передавать данные виджету через локальный Capacitor plugin `FriendsWidget`.
6. Открывать нужный экран по deeplink `matchapp://widget/open?...`.

Это уже реализовано в репозитории как база под WebView-shell:

- `capacitor.config.ts` добавлен.
- В `src/App.tsx` добавлен deeplink flow для открытия чата и трека из виджета.
- В `src/mobile/widgetBridge.ts` добавлена публикация snapshot с тем, что сейчас играет у друзей.
- В `native-templates/` лежат нативные шаблоны для iOS и Android.

## Как это теперь работает

1. React-приложение собирается в обычный Vite bundle.
2. Capacitor кладет этот bundle внутрь iOS/Android приложения и показывает его в WebView.
3. React загружает друзей.
4. После каждой синхронизации друзей приложение публикует snapshot для виджета.
5. Виджет берет featured friend + current song.
6. Тап по виджету открывает deeplink.
7. React принимает deeplink и открывает:
   - вкладку `Чаты`
   - чат с нужным другом
   - плеер, уже сфокусированный на треке друга

## Что нужно сделать локально для полной мобильной сборки

1. Установить Node.js и зависимости:
   - `npm install`
2. Создать нативные WebView-shell проекты:
   - `npm run cap:add:ios`
   - `npm run cap:add:android`
3. Скопировать шаблоны из `native-templates/ios` и `native-templates/android` в созданные проекты.
4. Добавить deeplink scheme `matchapp` в iOS/Android.
5. Для iOS:
   - создать Widget Extension target
   - включить `App Groups` c `group.com.bootcamp.match`
6. Для Android:
   - зарегистрировать `FriendsNowPlayingWidgetProvider`
   - добавить `receiver` и deep link intent filter в manifest
7. После изменений синхронизировать WebView bundle:
   - `npm run mobile:webview:sync`

## Ограничения текущего коммита

- В этом окружении изначально не было `node`, `npm`, `pnpm` и `bun`, поэтому автоматическая сборка зависит от отдельной установки Node.js.
- Android widget сейчас использует placeholders для artwork/avatar. Текст, CTA и deeplink уже wired; живые картинки лучше добить отдельным шагом через image cache.
