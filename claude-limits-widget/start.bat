@echo off
chcp 65001 >nul
rem Первый запуск: ставим библиотеки для значка у часов (pystray, Pillow)
python -c "import pystray, PIL" 2>nul || (
  echo Первый запуск: устанавливаю библиотеки для значка у часов...
  python -m pip install --user --quiet pystray pillow
)
rem Запуск виджета без окна консоли
start "" pythonw "%~dp0claude_limits.pyw"
