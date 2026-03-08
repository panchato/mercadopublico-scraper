@echo off
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Node.js no está instalado.
    echo  Por favor instala Node.js desde https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0node_modules\" (
    echo  Instalando dependencias por primera vez...
    cd /d "%~dp0"
    npm install >nul 2>&1
)

cd /d "%~dp0"
start /b node server.js > "%~dp0server.log" 2>&1
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
exit
