# Dala brain-hero — аудит (5 линз + синтез)

Дата: 2026-07-03. Метод: 5 параллельных агентов (fidelity / motion / code / design / perf), реальные WebGL-скрины, синтез + adversarial самокритика.

## Вердикт

Обёртка-страница - верная копия Dala (чёрный фон, тонкий заголовок слева, мозг справа, gold eyebrow, violet UI-акцент, meta-строка). **Сам мозг - главное, что просили скопировать - ещё нет.** Позиции точек кодируют правильную анатомию, но рендер убивает её: плоский size-флуд + ~45% холодных цветов + dim outline-спрайт ×0.72 → мутно-коричневый speckle-блоб (mean lit RGB 78,61,49) вместо золотого анатомического мозга. ~60% готовности: страница да, мозг нет.

## Biggest gap

Мозг не читается как мозг И не светится золотом. Композитный фикс: (1) вырезать борозды (decimate тёмных точек + size по яркости гребней), (2) золотое свечение (fill спрайта + убрать ×0.72 dim + тёплая палитра). Чинишь это - копия сходится.

## Самокритика (где обманул себя)

1. Разрабатывал в `?test` (loader скипается) → всегда видел собранный мозг, ни разу реальный первый заход. → [[dev-in-test-mode-hides-real-first-load]]
2. «Скормил настоящий brain PNG → значит мозг». Позиции верны, но flat-size + холодная палитра + dim спрайт размыли данные в радужный шум. Правильные данные ≠ читаемый рендер. → [[verify-render-against-reference-not-in-isolation]]
3. Тюнил цвет в изоляции: `*0.72` (гасить пересвет) + outline-only спрайт - каждое ок, вместе = коричневая грязь. Ни разу не сверил с золотым референсом.
4. `INTRO_DELAY=0.6` с комментом «wait for loader» - guessed magic-число, loader реально ~1.2с.

## Приоритетные фиксы

| # | Severity | Фикс | Файл |
|---|---|---|---|
| 1 | critical | Вырезать борозды: `size = 0.5 + b*b*2.4`, decimate `if(b<0.55 && rand>b) continue`, держать плотность гребней | index.html |
| 2 | critical | Золото: fill тёплого центра спрайта + убрать `vColor*0.72` (тюнить 0.85-1.0, следить за clip) | index.html |
| 3 | major | Палитра ~85% тёплая, убрать violet из частиц (violet только UI) | index.html |
| 4 | major | Сделать scatter→сборку видимой: связать intro с событием скрытия loader, детерминированный loader ~0.9с, scatter `WORLD*(0.6+rand*0.8)` | index.html |
| 5 | critical* | Loader не застревает если three-CDN упал: reveal вынести из module в classic script + self-host three + watchdog | index.html |
| 6 | major | Mobile: veil сильнее сверху, cta-row wrap, brain y=-10 scale 0.6, nav CTA видима | index.html |
| 7 | minor | Widow заголовка: перенос «Ask Dala to / find it.» | index.html |
| 8 | major | Perf (не влияет на desktop-вид): sway в vertex shader ИЛИ DynamicDrawUsage + стоп rewrite при e===1, mobile STEP=3 DPR 1.5 | index.html |

*critical только при отказе сети.

## Отброшенные (nitpicks)

points.js 340KB parse (43мс один раз, gzip решает) · `amat.opacity` no-op на ShaderMaterial (dead code, fold в cleanup) · gl_PointSize без DPR (тюнил на retina) · orphan CanvasTexture clone · reduced-motion (не fidelity) · redundant `?test` таймер.
