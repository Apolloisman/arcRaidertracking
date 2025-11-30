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

echo.
echo Fetching and displaying all available locations for %map%...
echo.

REM Show all locations before prompting for coordinates
node show-locations.cjs %map%

echo.
set /p coords="Enter your spawn coordinates (x y), landmark name, or press Enter to use first spawn: "

if "%coords%"=="" (
    echo.
    echo Using first spawn point...
    echo.
    node run-loot.cjs %map%
) else (
    REM Pass coordinates/landmark as-is (script will handle parsing)
    node run-loot.cjs %map% %coords%
)

echo.
echo Press any key to exit...
pause >nul

