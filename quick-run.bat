@echo off
REM Quick launcher for loot run generator
REM Usage: Double-click this file, then enter your map and coordinates when prompted

REM Change to the directory where this batch file is located
cd /d "%~dp0"

echo.
echo ========================================
echo   ARC RAIDERS LOOT RUN GENERATOR
echo ========================================
echo.

set /p map="Enter map name (dam/spaceport/buried-city/blue-gate): "
if "%map%"=="" (
    echo No map specified, using 'dam' as default
    set map=dam
)

set /p coords="Enter your spawn coordinates (x y) or press Enter to use saved spawn: "

if "%coords%"=="" (
    echo Using saved spawn coordinates...
    node run-loot.cjs %map%
) else (
    for /f "tokens=1,2" %%a in ("%coords%") do (
        node run-loot.cjs %map% %%a %%b
    )
)

echo.
echo Press any key to exit...
pause >nul

