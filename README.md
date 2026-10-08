# Spectre Studio — сайт-портфолио

Статический сайт киностудии Spectre Studio: главная, работы, страница каждого фильма, студия, основатель, контакты. Три языка: русский, узбекский (латиница), английский.

Сборка не нужна: обычные HTML, CSS и JS. Работает на GitHub Pages.

## Как менять контент

Почти всё лежит в одном файле — `assets/js/data.js`:

| Что | Где в `data.js` |
|---|---|
| Видео к фильму | `video: { youtube: "ID" }` или `video: { vimeo: "ID" }` у нужного проекта |
| Постер фильма | `poster: "assets/img/posters/имя.jpg"` (пока постера нет, сайт рисует его сам) |
| Короткое описание фильма | `logline: { ru: "...", uz: "...", en: "..." }` |
| Избранное на главной | список `featured` (порядок = порядок на главной) |
| Шоурил на главной | `showreel: { youtube: "ID" }` / `{ vimeo: "ID" }` / `{ file: "assets/video/showreel.mp4" }` |
| Контакты | `contacts` |
| Текст об основателе | `founder` |
| Заказчики | `clients` |

Тексты интерфейса и страницы «Студия» — в `assets/js/i18n.js`.

## Локальный просмотр

```bash
python3 -m http.server 8000
# открыть http://localhost:8000
```

## Публикация на GitHub Pages

Settings → Pages → Source: «Deploy from a branch» → ветка с сайтом, папка `/ (root)`.
