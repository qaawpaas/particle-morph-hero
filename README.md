# Dala — scroll-morph particle hero (clone)

Клон анимации [dala.craftedbygc.com](https://dala.craftedbygc.com) (Green Chameleon) /
[refero style](https://styles.refero.design/style/e5f5f8cf-e68d-4ed1-bbf5-6b67569af648).

Спек снят с ЖИВОГО сайта: 23 кадра (`reference/` + captures) → 5 агентов-критиков
разобрали анимацию по осям → сведено в build-спек → построено по нему.

## Запуск

Двойной клик по `index.html` (или `open index.html`), затем **скроллить**.
Нужен интернет (Three.js + Inter с CDN) и WebGL. Нет WebGL → текстовый hero, не ломается.

## Что это делает (как оригинал)

Одно поле частиц, scroll-scrubbed, морфится по сюжету:

| Скролл | Состояние | Текст |
|---|---|---|
| 0-13% | **МОЗГ** (сбоку, со стволом-хвостом внизу), amber-низ | лево: «Unlock collective wisdom» |
| 13-50% | распад → **разлёт** по всему экрану (пусто ~48%) | центр: «Knowledge, scattered» |
| 50-82% | пере-сбор в **СФЕРУ** с белым ядром | право: «Spark lightbulb moments» |
| 82-100% | разлёт → финал | лево/центр: манифест, «Your workplace has the answer» |

## Механика (сверено с кадрами)

- **Частица** = полый треугольник + **вложенный** треугольник (не залитый), additive → в
  плотных местах свечение. Palette **взвешенная**: amber/gold ~46% (доминанта) +
  лилово-белые ~34% + violet ~11% + мелочь (teal/blue/magenta/green). НЕ равный спектр.
  amber смещён на низ мозга (свет снизу). Размеры: много мелких, редко крупные.
- **Камера НЕПОДВИЖНА** (fov 45, z=560). Вся 3D/параллакс — из собственной **глубины
  частиц** (z-разброс), большие передние + мелкие задние. Камера НЕ едет, облако НЕ крутится.
- **Морф** в vertex shader: `pos = brain·wB + scatter·wSc + sphere·wSp`, веса от `uScroll`
  с плато (мозг / разлёт / сфера). Per-particle **stagger** (`±0.10`) → сборка «роем».
  Между формами — настоящий пустой scatter (сюжет «хаоса»).
- **Ambient всегда**: дрейф (больше в разлёте), медленное вращение глифа, мерцание.
- **Фон**: near-black `#0b0b0c` + film-grain (SVG turbulence) + тёплое свечение сверху.
- **Текст** меняет колонку по секции (лево/центр/право), veil следует за колонкой.

## Файлы

| Файл | Роль |
|---|---|
| `index.html` | страница + Three.js сцена (рантайм) |
| `points.js` | `window.__SHAPES__` = `{n:4500, brain, sphere}` (нормализ. координаты) |
| *build/dev (не в рантайме):* | |
| `build-shapes.js` | Node: печёт `points.js` (мозг-ресэмпл + fibonacci-сфера) |
| `points.brain.js`, `brain-src.png` | входы для сэмпла мозга |
| `reference/` | кадры живого Dala (сверка) |
| `node_modules/`, `package*.json` | playwright-core для съёмки живого сайта — можно удалить |
| `AUDIT.md`, `REFERENCE-GAP.md` | история ревью/сверки |

## Ручки

`WORLD` (масштаб) · `pickHex`/`AMBER,LILAC,VIOLET,REST` (палитра+веса) · `glyphTexture`
(форма глифа) · веса в vertex shader (timeline плато) · `aScat` (разброс разлёта) · `uScale`
(размер частиц) · `.spacer` height (длина скролла) · панели-бэнды `ops[]` + классы `.left/.center/.right`.
`?test` — убрать loader · `?p=0.74` — запинить прогресс.

> Проверка scroll-состояний: снимай **playwright** (реальные кадры). Chrome `--screenshot`
> под `--virtual-time-budget` недосходится (scrollP сглажен по кадрам) → врёт на переходах.

## Пере-печь / прод

- `node build-shapes.js` — перезапишет `points.js`. Формы нормализуй в ~`[-0.5..0.5]`, длина `N`.
- Шрифт-заглушка **Inter**; оригинал — тесный neo-grotesque (Neue Haas / Söhne / Aeonik).
- Three.js `@0.160.0` с CDN (ES-module import работает и из `file://`, и с хоста).
- loader/reveal в classic-скрипте + watchdog → падение CDN даёт текст, не застрявший loader.
