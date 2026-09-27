# Design

Источник правды — брендбук Agent UI Brand System. Здесь зафиксировано, как он лёг на этот продукт.

## Visual Theme

Светлое рабочее пространство и тёмно-зелёная навигация. Restrained: белый 60–75%, тёмно-зелёный 15–25%, лайм 3–8% (только сигнал), вторичные 5–10%.

Сцена: команда за ноутбуком в светлом офисе или зале хакатона, днём, в фокусе и под дедлайном; иногда экран выводится на проектор перед жюри. Отсюда светлая тема рабочих экранов и высокий контраст.

## Color

| Токен                 | Hex       | Роль                                                           |
| --------------------- | --------- | -------------------------------------------------------------- |
| `--brand-lime`        | `#00E564` | primary action, running, progress, selected, active nav        |
| `--brand-dark`        | `#00281F` | основной текст, sidebar, тёмные кнопки (вместо чёрного)        |
| `--brand-accent-ink`  | `#0A7A38` | ссылки, вторичный акцент, success-текст                        |
| `--brand-accent-soft` | `#E0F7E9` | selected rows, badges, hover ghost                             |
| `--brand-deep-green`  | `#084D2A` | hover тёмных поверхностей                                      |
| `--border`            | `#E5EAE7` | все границы и разделители                                      |
| `--muted`             | `#7A8C84` | только иконки и декоративные метки ≥ 18px                      |
| `--muted-text`        | `#5B6B64` | вторичный текст (4.5:1+ на белом; брендовый muted даёт ~3.6:1) |
| `--surface-2`         | `#F6F8F7` | фон второго уровня: rail, превью, панели                       |

Семантика: success — accent-ink, warning `#B45309`, error `#C62828`, info `#1D4ED8`, только там, где цвет несёт системный смысл.

## Typography

Plus Jakarta Sans для латиницы, Manrope для кириллицы: один стек, склейка через `unicode-range`. Фиксированная rem-шкала (product): Display 38/700, Page heading 30/700, Section 20/600, Metrics 20/650, Label 13/600, Body 14/400 (lh 1.55), Meta 12/500. Uppercase только в мелких лейблах.

## Layout

Сетка 4px. Sidebar 248px, контент full-width с padding 32–40px, максимум 1440px. Композиция экрана: контекстный лейбл → короткий заголовок → одна строка описания → основной контент → вторичное. Списки — таблицы, не сетки карточек.

## Components

- Radius: controls 8, inputs/buttons 10, cards 16, большие панели 20.
- Кнопки: primary lime/dark text, secondary dark, secondary light с border, ghost с hover accent-soft. Высота 40.
- Inputs 40–44, border `--border`, focus border lime + кольцо 2px с прозрачностью, без glow.
- Карточки: белые, border, без тени. Тень только у floating (dropdown, modal, notification).
- Статус-бейджи pill: точка + текст. Running — лайм с пульсом (отключается при reduced motion).
- Иконки: Lucide, stroke 1.75, 16/20/24.

## Motion

120–180ms micro, 180–240ms переходы; ease-out-quart. Только opacity, translate, scale 0.98→1. Без bounce и декоративных циклов, кроме индикатора running.
