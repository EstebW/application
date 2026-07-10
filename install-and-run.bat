@echo off
echo ===================================
echo  Mon Jumeau Celebre - Setup
echo ===================================
echo.

:: Try to find Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Node.js not found in PATH, trying common location...
    set PATH=C:\Program Files\nodejs;%PATH%
)

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js not found! Install from https://nodejs.org
    pause
    exit /b 1
)

echo Node.js found!
node --version
echo.

echo Installing dependencies...
npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

echo.
echo Starting development server...
echo Open http://localhost:3000 in your browser
echo.
npm run dev
