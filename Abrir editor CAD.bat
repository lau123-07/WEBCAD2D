@echo off
cd /d "%~dp0"
if not exist package.json (
  echo No encuentro package.json en: %cd%
  echo Este archivo tiene que estar dentro de la carpeta del proyecto.
  pause
  exit /b
)
call npm run dev
pause




