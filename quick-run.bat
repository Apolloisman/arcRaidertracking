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
echo Fetching available locations for %map%...
echo.

REM First, show all locations by running with no coordinates (this will display locations)
node run-loot.cjs %map% 2>nul | findstr /C:"SPAWN POINTS" /C:"EXTRACTION POINTS" /C:"LOOT CACHES" /C:"Available locations" /C:"spawn point" /C:"extraction" /C:"cache" /C:"Using first" /C:"Using saved" >nul
if errorlevel 1 (
    echo (Locations will be shown when generating path)
)

echo.
set /p coords="Enter your spawn coordinates (x y) or landmark name, or press Enter to use first spawn: "

if "%coords%"=="" (
    echo.
    echo Using first spawn point...
    node run-loot.cjs %map%
) else (
    REM Check if it's coordinates (two numbers) or a landmark name
    echo %coords% | findstr /R "^[0-9][0-9]* [0-9][0-9]*" >nul
    if errorlevel 1 (
        REM It's a landmark name (or invalid), pass as single argument
        node run-loot.cjs %map% "%coords%"
    ) else (
        REM It's coordinates, split and pass separately
        for /f "tokens=1,2" %%a in ("%coords%") do (
            node run-loot.cjs %map% %%a %%b
        )
    )
)

echo.
echo Press any key to exit...
pause >nul

