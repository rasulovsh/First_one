@echo off
chcp 65001 >nul
rem Добавляет виджет в автозагрузку Windows (ярлык в папке "Автозагрузка")
set "TARGET=%~dp0claude_limits.pyw"
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Claude Limits.lnk');" ^
  "$s.TargetPath=(Get-Command pythonw).Source; $s.Arguments='\"%TARGET%\"'; $s.WorkingDirectory='%~dp0'; $s.Save()"
echo Готово: виджет будет запускаться вместе с Windows.
pause
