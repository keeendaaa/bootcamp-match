# Match Web App

Веб-приложение продолжает работать как Vite + React + TypeScript, а мобильная сборка делается как WebView-shell через Capacitor. Детали и шаги описаны в [MOBILE.md](./MOBILE.md).

## UI Redesign Notes

Текущий интерфейс оформлен как mobile-first музыкальное приложение в духе Apple Music/iOS:

- `src/App.tsx` содержит основные экраны, player state, auth flow, friend profiles, chats, discover, profile и now-playing overlay.
- `src/index.css` содержит дизайн-систему и визуальные слои приложения. Блок `APPLE MUSIC REDESIGN` переопределяет авторизованное приложение, не затрагивая публичный landing.
- Публичный landing включается через `.onboarding-shell`; для него отдельно снято ограничение phone-frame на desktop через `body:has(.onboarding-shell)`.
- Авторизованная часть сохраняет phone-frame app shell, floating bottom dock, mini-player, glass cards, Apple Music-like red/pink accent и темный fullscreen player.
- Friend profile sheet имеет отдельный блок `FRIEND PROFILE SHEET FIX`, чтобы карточка друга и треки не наследовали стили пользовательского профиля.

Проверка перед публикацией:

```bash
npm run build:web
npm run lint
```

`npm run lint` сейчас может показывать существующие предупреждения `react-hooks/exhaustive-deps` в `src/App.tsx`; они не относятся к визуальному редизайну.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
