@echo off
title Alcina Office
cd /d "%~dp0apps\office"
echo ============================================
echo   Iniciando o Alcina Office...
echo   (deixe ESTA janela aberta; feche-a para encerrar)
echo ============================================
echo.
call npm run dev
echo.
echo A central foi encerrada.
pause
