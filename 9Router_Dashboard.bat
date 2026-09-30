@echo off
title 9Router Control Panel
chcp 65001 >nul
:menu
cls
echo ==========================================
echo         9ROUTER CONTROL PANEL 
echo ==========================================
echo.

netstat -ano | find "20127" >nul
if %errorlevel% equ 0 (
    echo   TRANG THAI: [ DANG CHAY ]
) else (
    echo   TRANG THAI: [ DA TAT ]
)

echo.
echo ==========================================
echo   [1] Bat 9Router (Chay ngam + Mo Web)
echo   [2] Tat 9Router
echo   [3] Chi mo trang Web (Khong khoi dong lai)
echo   [0] Thoat Menu
echo ==========================================
echo.
set /p choice="Nhap lua chon cua ban (0-3): "

if "%choice%"=="1" goto start
if "%choice%"=="2" goto stop
if "%choice%"=="3" goto open
if "%choice%"=="0" exit

goto menu

:start

wscript "%~dp0start_9router.vbs"
timeout /t 2 >nul
goto menu

:stop

for /f "tokens=5" %%a in ('netstat -ano ^| find "20127"') do taskkill /F /PID %%a >nul 2>&1
timeout /t 2 >nul
goto menu

:open
start http://localhost:20127
goto menu