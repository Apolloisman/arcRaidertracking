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

REM First, show all locations by calling the script with a special "show-only" mode
REM We'll use list-spawns.cjs or create a temp call that shows locations
REM Actually, let's just call run-loot.cjs with a dummy input that will trigger display, then exit
REM Better: create a simple node command that just shows locations

node -e "const {createArcRaidersClient} = require('./dist/index.js'); (async () => { try { const client = createArcRaidersClient(); const mapData = await client.getMapData('%map%'); const spawns = (mapData.waypoints || []).filter(w => w.type === 'spawn' && w.coordinates); const extractions = (mapData.waypoints || []).filter(w => w.type === 'extraction' && w.coordinates); const caches = (mapData.pois || []).filter(p => p.type === 'cache' && p.coordinates); console.log('\n📍 All available locations on %map%:'); console.log('─'.repeat(70)); if (spawns.length > 0) { console.log('\n   🟢 SPAWN POINTS:'); spawns.forEach((s, i) => { const c = s.coordinates; const z = c.z !== undefined ? `, ${c.z.toFixed(1)}` : ''; console.log(`      ${(i+1).toString().padStart(2)}. ${(s.name || 'player_spawn').padEnd(30)} (${c.x.toFixed(1)}, ${c.y.toFixed(1)}${z})`); }); } if (extractions.length > 0) { console.log('\n   🔴 EXTRACTION POINTS:'); extractions.forEach((e, i) => { const c = e.coordinates; const z = c.z !== undefined ? `, ${c.z.toFixed(1)}` : ''; console.log(`      ${(i+1).toString().padStart(2)}. ${(e.name || 'extraction').padEnd(30)} (${c.x.toFixed(1)}, ${c.y.toFixed(1)}${z})`); }); } if (caches.length > 0) { console.log('\n   💰 LOOT CACHES (showing first 10):'); caches.slice(0, 10).forEach((cache, i) => { const c = cache.coordinates; const z = c.z !== undefined ? `, ${c.z.toFixed(1)}` : ''; console.log(`      ${(i+1).toString().padStart(2)}. ${(cache.name || 'cache').padEnd(30)} (${c.x.toFixed(1)}, ${c.y.toFixed(1)}${z})`); }); if (caches.length > 10) { console.log(`      ... and ${caches.length - 10} more cache locations`); } } console.log('─'.repeat(70)); console.log('💡 You can use these coordinates or search by landmark name\n'); } catch(e) { console.error('Error:', e.message); } })();"

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

