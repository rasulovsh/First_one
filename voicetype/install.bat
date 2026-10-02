@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === VoiceType: установка ===
where python >nul 2>nul || (echo Python не найден. Установите Python 3.10+ с python.org и отметьте "Add python.exe to PATH". & pause & exit /b 1)
if not exist .venv python -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -r requirements.txt || (echo Ошибка установки зависимостей & pause & exit /b 1)
echo.
echo Готово. Запускаю виджет. При первом запуске скачается модель (~1.6 ГБ).
start "" .venv\Scripts\pythonw.exe voicetype.py
timeout /t 5 >nul
