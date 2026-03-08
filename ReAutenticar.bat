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

cd /d "%~dp0"
echo.
echo  Abriendo navegador para re-autenticación...
echo  Completa el login con Clave Única y el doble factor (2FA).
echo  Esta ventana se cerrará automáticamente al terminar.
echo.
node login-local.js
echo.
echo  Sesión actualizada correctamente.
pause
