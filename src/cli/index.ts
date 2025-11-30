#!/usr/bin/env node

import { createArcRaidersClient } from '../arc-raiders/client';
import { exportToJSON, exportToJSONString } from '../export/json';
import { exportToCSV, exportToCSVString } from '../export/csv';
import { getWeaponStats, getRarityDistribution, findBestWeapon } from '../analytics/stats';
import type { LootRunOptions } from '../pathfinding/loot-run';

const client = createArcRaidersClient();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Arc Raiders API CLI

Usage:
  arc-raiders <command> [options]

Commands:
  items          List all items
  weapons        List all weapons
  quests         List all quests
  arcs           List all ARCs
  traders        List all traders
  export <type>  Export data (json|csv)
  stats          Show statistics
  help           Show this help message

Examples:
  arc-raiders items
  arc-raiders weapons --rarity legendary
  arc-raiders export json --output data.json
  arc-raiders stats
    `);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'items': {
        const items = await client.getItems();
        console.log(JSON.stringify(items, null, 2));
        break;
      }

      case 'weapons': {
        const rarityIndex = args.indexOf('--rarity');
        const rarity = rarityIndex !== -1 ? args[rarityIndex + 1] : undefined;
        const weapons = await client.getWeapons(rarity ? { rarity: rarity as any } : undefined);
        console.log(JSON.stringify(weapons, null, 2));
        break;
      }

      case 'quests': {
        const quests = await client.getQuests();
        console.log(JSON.stringify(quests, null, 2));
        break;
      }

      case 'arcs': {
        const arcs = await client.getARCs();
        console.log(JSON.stringify(arcs, null, 2));
        break;
      }

      case 'traders': {
        const traders = await client.getTraders();
        console.log(JSON.stringify(traders, null, 2));
        break;
      }

      case 'loot-run': {
        const mapName = args[1];
        if (!mapName) {
          console.error('Error: Map name required');
          console.log('\nUsage: arc-raiders loot-run <map-name> [options]');
          console.log('\nAvailable maps: dam, spaceport, buried-city, blue-gate');
          console.log('\nOptions:');
          console.log('  --max-caches <number>     Maximum caches to visit (default: 15)');
          console.log('  --max-time <seconds>       Max time before heading to extraction (default: 300)');
          console.log('  --extraction-proximity <n>  Max distance from extraction to loot (default: 100)');
          console.log('  --avoid-dangerous          Avoid dangerous areas (objectives, ARCs, buildings)');
          console.log('  --use-raider-key          Prefer raider key extraction points');
          console.log('  --danger-radius <n>        Radius to check for danger (default: 50)');
          console.log('  --spawn-x <number>         Your spawn X coordinate (optional)');
          console.log('  --spawn-y <number>        Your spawn Y coordinate (optional)');
          console.log('  --spawn-z <number>         Your spawn Z coordinate (optional)');
          console.log('\nExample:');
          console.log('  arc-raiders loot-run dam --max-caches 10 --max-time 240');
          console.log('  arc-raiders loot-run dam --spawn-x 100.5 --spawn-y 200.3 --spawn-z 15.2');
          process.exit(1);
        }

        // Parse options
        const maxCachesIndex = args.indexOf('--max-caches');
        const maxCaches = maxCachesIndex !== -1 ? parseInt(args[maxCachesIndex + 1]) : undefined;

        const maxTimeIndex = args.indexOf('--max-time');
        const maxTime = maxTimeIndex !== -1 ? parseInt(args[maxTimeIndex + 1]) : undefined;

        const extractionProximityIndex = args.indexOf('--extraction-proximity');
        const extractionProximity = extractionProximityIndex !== -1 
          ? parseInt(args[extractionProximityIndex + 1]) 
          : undefined;

        const avoidDangerous = args.includes('--avoid-dangerous');
        const useRaiderKey = args.includes('--use-raider-key');
        
        const dangerRadiusIndex = args.indexOf('--danger-radius');
        const dangerRadius = dangerRadiusIndex !== -1 ? parseInt(args[dangerRadiusIndex + 1]) : undefined;

        // Parse spawn coordinates if provided
        const spawnXIndex = args.indexOf('--spawn-x');
        const spawnYIndex = args.indexOf('--spawn-y');
        const spawnZIndex = args.indexOf('--spawn-z');
        
        const spawnX = spawnXIndex !== -1 ? parseFloat(args[spawnXIndex + 1]) : undefined;
        const spawnY = spawnYIndex !== -1 ? parseFloat(args[spawnYIndex + 1]) : undefined;
        const spawnZ = spawnZIndex !== -1 ? parseFloat(args[spawnZIndex + 1]) : undefined;

        const startAtCoordinates = (spawnX !== undefined && spawnY !== undefined) ? {
          x: spawnX,
          y: spawnY,
          ...(spawnZ !== undefined && { z: spawnZ }),
        } : undefined;

        const options: LootRunOptions = {
          startAtSpawn: !startAtCoordinates, // Only use spawn points if coordinates not provided
          startAtCoordinates,
          endAtExtraction: true,
          useRaiderKey,
          maxCaches,
          maxTimeBeforeExtraction: maxTime,
          extractionProximity,
          avoidDangerousAreas: avoidDangerous,
          dangerRadius,
          algorithm: 'extraction-aware',
        };

        try {
          const lootRun = await client.generateLootRunForMap(mapName, options);
          
          if (!lootRun) {
            console.error(`\n❌ Could not generate loot run for map "${mapName}"`);
            console.log('   Make sure the map name is correct and has loot caches.');
            process.exit(1);
          }

          console.log(client.formatLootRunPath(lootRun));
        } catch (error) {
          console.error('Error generating loot run:', error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
        break;
      }

      case 'export': {
        const type = args[1];
        const outputIndex = args.indexOf('--output');
        const output = outputIndex !== -1 ? args[outputIndex + 1] : undefined;
        
        if (!type || !['json', 'csv'].includes(type)) {
          console.error('Invalid export type. Use "json" or "csv"');
          process.exit(1);
        }

        const items = await client.getItems();
        
        if (type === 'json') {
          if (output) {
            await exportToJSON(items, output);
            console.log(`Exported ${items.length} items to ${output}`);
          } else {
            console.log(exportToJSONString(items));
          }
        } else if (type === 'csv') {
          if (output) {
            await exportToCSV(items, output);
            console.log(`Exported ${items.length} items to ${output}`);
          } else {
            console.log(exportToCSVString(items));
          }
        }
        break;
      }

      case 'stats': {
        const weapons = await client.getWeapons();
        const items = await client.getItems();
        
        const weaponStats = getWeaponStats(weapons);
        const rarityDist = getRarityDistribution(items);
        const bestWeapon = findBestWeapon(weapons);

        console.log(JSON.stringify({
          weapons: {
            total: weapons.length,
            stats: weaponStats,
            best: bestWeapon ? {
              name: bestWeapon.name,
              damage: bestWeapon.damage,
            } : null,
          },
          items: {
            total: items.length,
            rarityDistribution: rarityDist,
          },
        }, null, 2));
        break;
      }

      case 'help':
      default: {
        console.log(`
Arc Raiders API CLI

Usage:
  arc-raiders <command> [options]

Commands:
  items          List all items
  weapons        List all weapons
  quests         List all quests
  arcs           List all ARCs
  traders        List all traders
  loot-run       Generate optimized loot run path for a map
  export <type>  Export data (json|csv)
  stats          Show statistics
  help           Show this help message

Examples:
  arc-raiders items
  arc-raiders weapons --rarity legendary
  arc-raiders loot-run dam
  arc-raiders loot-run spaceport --max-caches 10
  arc-raiders export json --output data.json
  arc-raiders stats
        `);
        break;
      }
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();

