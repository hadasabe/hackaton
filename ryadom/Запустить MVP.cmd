@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Нужен установленный Python 3.10 или новее.
  pause
  exit /b 1
)
python server.py
if errorlevel 1 pause
