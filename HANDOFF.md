# HANDOFF — Dala-style particle hero (полные исходники)

Scroll-morph particle-сайт: одно поле частиц морфится по скроллу **МОЗГ → разлёт → ЛАМПОЧКА → ЗЕМЛЯ**.
Three.js + WebGL, без билд-степа для рантайма. Это актуальная версия (README.md — историческая, местами устарел).

## Быстрый старт

**Проще всего — живая ссылка** (внизу файла / в описании репо): открывается в любом браузере, на телефоне, ставить ничего не надо, одинаково у всех.

Локально нужен http-сервер (ES-модули не грузятся с `file://` — двойной клик в Safari/части браузеров не запустит):
```
npx serve .            # или:  python3 -m http.server
```
→ открыть выданный `http://localhost:...`, скроллить вниз.

**Все зависимости вшиты** (`vendor/`): Three.js + шрифт Inter локально, **ноль внешних CDN** → работает офлайн и одинаково в любом регионе. Нет WebGL → текстовый hero, не падает.

## Структура

| Файл/папка | Роль |
|---|---|
| `index.html` | страница + вся Three.js сцена (рантайм): шейдеры, timeline, 2 слоя частиц, текст-панели |
| `points.js` | `window.__SHAPES__ = {n, brain, bulb, earth, bri, land}` — запечённые формы (норм. ~[-0.5..0.5]) |
| `build-shapes.js` | Node-скрипт: печёт `points.js` (мозг из маски + лампочка-революция + земля-глобус) |
| `points.brain.js` | сэмпл яркости из гравюры мозга (вход для build-shapes) |
| `brain-src.png` | исходная гравюра мозга (side-profile), из неё сделан `points.brain.js` |
| `scripts/histogram.js` | харнесс объективной приёмки: near-black% + hue-гистограмма PNG (спектр vs доминанта) |
| `verify-shot.js` | playwright-скрин на заданном скролле: `node verify-shot.js 0.86 out.png` |
| `plans/2026-07-04-*.md` | план ре-дизайна: все фазы, числа, грабли — читай для контекста |
| `AUDIT.md`, `REFERENCE-GAP.md` | история ревью/сверки с живым Dala |
| `vendor/` | Three.js + постпроцессинг + шрифт Inter — вшиты локально, **ноль внешних CDN** |
| `package.json` | deps: three, @fontsource-variable/inter (уже скопированы в `vendor/`); playwright-core (дев-скрины) |

## Архитектура рантайма (index.html)

- **2 слоя частиц** (N=11000 shape + ~3600 ambient) в одной геометрии:
  - **SHAPE** — морфит brain→scatter→bulb→earth в vertex shader: `pos = brain·wB + scatter·wSc + bulb·wBu + earth·wE`, веса от `uScroll` с плато + per-particle stagger.
  - **AMBIENT** — все 4 shape-цели = один wide-scatter home (веса всегда в сумме 1) → никогда не морфит, только дрейфует, заполняет вьюпорт. Экран не пустеет.
- **Камера** едет по Z сквозь поле: `camera.position.z = 600 - scrollP*230`.
- **Палитра** — полный спектр equal-mix (`pickHex()`), НЕ золотая доминанта. Bloom `0.42` → хрустящий край треугольника.
- **Мозг** — округлая оболочка + гири-рельеф из яркости гравюры (`build-shapes.js`).
- **Земля** — континенты metaball, США развёрнута в камеру (`FRONT=190°`), тинт суша-зелёная/океан-синий (`aLand` + шейдер, gated на `wE`), задняя полусфера гаснет.

## Timeline (скролл)

| % | Форма | Текст-панель |
|---|---|---|
| 0-10 | МОЗГ (объёмный, спектр) | лево: Unlock collective wisdom |
| 26-40 | разлёт по экрану | центр: Knowledge, scattered |
| 54-66 | ЛАМПОЧКА | право: Spark lightbulb moments |
| 80-92 | ЗЕМЛЯ (Америка спереди) | лево: A better world of work |

## Пере-печь формы

```
node build-shapes.js     # перезапишет points.js
```
Ручки континентов — массив `CONT` [lat,lon,rad] + `FRONT` (какой меридиан в камеру). Мозг-глубина — `round*0.28 + relief`. `N=11000`.

## Заменить мозг своим источником

`sample-brain.js` превращает ЛЮБУЮ картинку мозга в маску частиц:
```
node sample-brain.js brain-new.png 20000 1.7   # PNG -> points.brain.js
node build-shapes.js                            # points.brain.js -> points.js
```
Аргументы: `<png> <кол-во точек> <гамма>`. Гамма выше (2-3) = только яркая структура; ниже (1) = плотнее заливка.

**Какой источник конвертится хорошо:** ФОТО или залитый рендер мозга — тело светлое, борозды тёмные, фон тёмный. Яркость = форма + тень извилин → структура читается.
**Плохо:** line-art / гравюра (белые линии на чёрном) — яркость метит только линии, даёт равномерную заливку силуэта без фолдов.
JPG/HEIC → сперва в PNG: `sips -s format png in.jpg --out brain-new.png` (macOS).

## Приёмка / дебаг

```
npm install                              # playwright-core (один раз)
node verify-shot.js 0 shot.png           # скрин hero
node scripts/histogram.js shot.png       # числа: near-black% + спектр
```
`?test` — убрать loader · `?p=0.86` — запинить скролл на earth-фазе.

**Зависимости харнесса (только для дев-скринов, не для рантайма):**
- `histogram.js` — чистый Node stdlib, нужен только `node`. Работает везде.
- `verify-shot.js` — нужен **локально установленный Google Chrome** (запускается через `channel:"chrome"`, mac/win/linux). Кастомный бинарь: `CHROME_PATH=/path/to/chrome node verify-shot.js ...`. Chrome нет → падает сразу с явной ошибкой `executable doesn't exist` (не зависает).
- `build-shapes.js` — чистый Node stdlib, ноль npm-зависимостей, seed фиксированный → детерминированный `points.js`.
- Рантайму (`index.html`) ничего из этого не нужно — только браузер + интернет (three.js/шрифт с CDN).

## Деплой (прод)

Статика, любой хост. Drag-drop папки (без `node_modules`) на **Vercel** / **Netlify** → готовая ссылка. Или GitHub Pages. Ничего собирать не надо — это статические файлы.
