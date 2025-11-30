#!/usr/bin/env node

/**
 * Show all locations for a specific map
 */

const { createArcRaidersClient } = require('./dist/index.js');

const GRID_COLUMNS = 6;
const GRID_ROWS = 6;
const GRID_COLUMN_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function deriveBounds(mapData) {
  const coords = [];
  (mapData.waypoints || []).forEach(wp => {
    if (wp.coordinates) coords.push(wp.coordinates);
  });
  (mapData.pois || []).forEach(poi => {
    if (poi.coordinates) coords.push(poi.coordinates);
  });

  if (coords.length < 2) {
    return { minX: 0, maxX: 6000, minY: 0, maxY: 4500 };
  }

  return {
    minX: Math.min(...coords.map(c => c.x)),
    maxX: Math.max(...coords.map(c => c.x)),
    minY: Math.min(...coords.map(c => c.y)),
    maxY: Math.max(...coords.map(c => c.y)),
  };
}

function coordToGridCell(coord, bounds) {
  if (!coord) return '—';
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanY = bounds.maxY - bounds.minY || 1;
  const normX = Math.min(0.9999, Math.max(0, (coord.x - bounds.minX) / spanX));
  const normY = Math.min(0.9999, Math.max(0, (coord.y - bounds.minY) / spanY));
  const colIndex = Math.floor(normX * GRID_COLUMNS);
  const rowIndex = Math.floor(normY * GRID_ROWS);
  const columnLabel = GRID_COLUMN_LABELS[colIndex] || `C${colIndex + 1}`;
  const rowLabel = (rowIndex + 1).toString();
  return `${columnLabel}${rowLabel}`;
}

async function showLocations(mapName) {
  try {
    const client = createArcRaidersClient();
    const mapData = await client.getMapData(mapName);
    
    const bounds = deriveBounds(mapData);
    const spawns = (mapData.waypoints || []).filter(w => w.type === 'spawn' && w.coordinates);
    const extractions = (mapData.waypoints || []).filter(w => w.type === 'extraction' && w.coordinates);
    const caches = (mapData.pois || []).filter(p => p.type === 'cache' && p.coordinates);
    
    console.log(`\n📍 All available locations on ${mapName}:`);
    console.log('─'.repeat(70));
    
    if (spawns.length > 0) {
      console.log('\n   🟢 SPAWN POINTS:');
      spawns.forEach((spawn, i) => {
        const coords = spawn.coordinates;
        const name = spawn.name || 'player_spawn';
        const zStr = coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : '';
        const gridCell = coordToGridCell(coords, bounds);
        console.log(`      ${(i + 1).toString().padStart(2)}. ${name.padEnd(30)} (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${zStr}) [${gridCell}]`);
      });
    }
    
    if (extractions.length > 0) {
      console.log('\n   🔴 EXTRACTION POINTS:');
      extractions.forEach((ext, i) => {
        const coords = ext.coordinates;
        const name = ext.name || 'extraction';
        const zStr = coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : '';
        const gridCell = coordToGridCell(coords, bounds);
        console.log(`      ${(i + 1).toString().padStart(2)}. ${name.padEnd(30)} (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${zStr}) [${gridCell}]`);
      });
    }
    
    if (caches.length > 0) {
      console.log('\n   💰 LOOT CACHES (showing first 10):');
      caches.slice(0, 10).forEach((cache, i) => {
        const coords = cache.coordinates;
        const name = cache.name || 'cache';
        const zStr = coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : '';
        const gridCell = coordToGridCell(coords, bounds);
        console.log(`      ${(i + 1).toString().padStart(2)}. ${name.padEnd(30)} (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${zStr}) [${gridCell}]`);
      });
      if (caches.length > 10) {
        console.log(`      ... and ${caches.length - 10} more cache locations`);
      }
    }
    
    console.log('─'.repeat(70));
    console.log('💡 Grid references (e.g., B4) align with the overlay — call out the cell when picking your spawn.\n');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

const mapName = process.argv[2];
if (!mapName) {
  console.error('Usage: node show-locations.cjs <map-name>');
  process.exit(1);
}

showLocations(mapName);

