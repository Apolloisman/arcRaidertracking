#!/usr/bin/env node

/**
 * Show all locations for a specific map
 */

const { createArcRaidersClient } = require('./dist/index.js');

async function showLocations(mapName) {
  try {
    const client = createArcRaidersClient();
    const mapData = await client.getMapData(mapName);
    
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
        console.log(`      ${(i + 1).toString().padStart(2)}. ${name.padEnd(30)} (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${zStr})`);
      });
    }
    
    if (extractions.length > 0) {
      console.log('\n   🔴 EXTRACTION POINTS:');
      extractions.forEach((ext, i) => {
        const coords = ext.coordinates;
        const name = ext.name || 'extraction';
        const zStr = coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : '';
        console.log(`      ${(i + 1).toString().padStart(2)}. ${name.padEnd(30)} (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${zStr})`);
      });
    }
    
    if (caches.length > 0) {
      console.log('\n   💰 LOOT CACHES (showing first 10):');
      caches.slice(0, 10).forEach((cache, i) => {
        const coords = cache.coordinates;
        const name = cache.name || 'cache';
        const zStr = coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : '';
        console.log(`      ${(i + 1).toString().padStart(2)}. ${name.padEnd(30)} (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${zStr})`);
      });
      if (caches.length > 10) {
        console.log(`      ... and ${caches.length - 10} more cache locations`);
      }
    }
    
    console.log('─'.repeat(70));
    console.log('💡 You can use these coordinates or search by landmark name\n');
    
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

