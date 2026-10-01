@echo off
chcp 65001 >nul
rem Подключает виджет к Claude Code (строка состояния передаёт лимиты виджету)
python "%~dp0claude_limits.pyw" --install
pause
