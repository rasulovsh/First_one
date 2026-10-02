#!/bin/bash
cd "$(dirname "$0")"
echo "=== VoiceType: установка ==="
command -v python3 >/dev/null || { echo "Установите Python 3.10+ с python.org"; exit 1; }
[ -d .venv ] || python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
echo "Готово. Разрешите Терминалу/Python доступ: Настройки → Конфиденциальность →"
echo "Микрофон, Универсальный доступ и Мониторинг ввода."
nohup .venv/bin/python voicetype.py >/dev/null 2>&1 &
