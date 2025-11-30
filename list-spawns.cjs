#!/usr/bin/env node

/**
 * List all spawn points for all maps
 */

const { createArcRaidersClient } = require('./dist/index.js');

async function listSpawns() {
  try {
    const client = createArcRaidersClient();
    const maps = ['dam', 'spaceport', 'buried-city', 'blue-gate'];
    
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║           ARC RAIDERS SPAWN POINTS                        ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    for (const mapName of maps) {
      const mapData = await client.getMapData(mapName);
      const spawns = (mapData.waypoints || []).filter(w => w.type === 'spawn' && w.coordinates);
      
      console.log(`\n🗺️  ${mapName.toUpperCase()}: ${spawns.length} spawn points`);
      console.log('─'.repeat(60));
      
      if (spawns.length === 0) {
        console.log('   No spawn points found in map data');
        continue;
      }
      
      spawns.forEach((spawn, i) => {
        const coords = spawn.coordinates;
        const name = spawn.name || 'player_spawn';
        const zStr = coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : '';
        console.log(`   ${(i + 1).toString().padStart(2)}. ${name.padEnd(20)} (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${zStr})`);
      });
    }
    
    console.log('\n💡 TIP: Use these coordinates with: node run-loot.cjs <map> <x> <y>');
    console.log('   Or search by landmark: node run-loot.cjs <map> "landmark name"\n');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

listSpawns();

