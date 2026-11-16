# Loomixx Control Center (LCC)

Desktop-first control center студии Loomixx: проекты, серверы, домены, клиенты, docs, SEO, финансы, секреты.

Архитектура и правила: [`stack.md`](./stack.md).

## Запуск (браузер + local vault в IndexedDB)

```bash
npm install
npm run dev
```

При первом входе задайте мастер-пароль — создастся зашифрованный vault с демо-данными.

## Desktop (Tauri)

```bash
npm run desktop
```

Нужны:

1. Rust (`rustup`)
2. **Visual Studio 2022 Build Tools** с workload **Desktop development with C++** (линкер `link.exe`)
3. WebView2

Сборка установщика:

```bash
npm run desktop:build
```
