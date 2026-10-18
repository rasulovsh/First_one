# geo-sleuth — установка в Claude Desktop

Источник: https://github.com/Oldcircle/geo-sleuth (MIT), коммит da0813705c8beb0d9b82fbbf9ec5480ed11468c4.

## Вариант 1 — чат Claude Desktop (загрузка скилла)
1. Скачайте `dist/geo-sleuth.zip` из этой ветки.
2. Claude Desktop → Settings → Capabilities → включите «Code execution and file creation».
3. Settings → Capabilities → Skills → Upload skill → выберите `geo-sleuth.zip`.
4. Включите переключатель у geo-sleuth.

Скилл ходит в интернет (OSM Overpass, спутниковые тайлы, обратный поиск Baidu/Yandex),
поэтому в песочнице чата часть шагов может не работать без сетевого доступа.

## Вариант 2 — Claude Code / вкладка Code в Desktop (полная функциональность)
```bash
git clone https://github.com/Oldcircle/geo-sleuth
mkdir -p ~/.claude/skills
cp -r geo-sleuth/skills/geo-sleuth ~/.claude/skills/
```
Нужны Python 3.10+, `uv`, `curl`, Google Chrome или `uvx playwright install chromium`.
При первом запуске попросите Claude выполнить `scripts/doctor.py`.

В этом репозитории скилл также лежит в `.claude/skills/geo-sleuth` и подхватывается
Claude Code автоматически при работе в репо.
