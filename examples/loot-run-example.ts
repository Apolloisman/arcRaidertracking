import { createArcRaidersClient } from '../src';

/**
 * Example: Generate optimized loot run paths for Arc Raiders maps
 */
async function lootRunExample() {
  const client = createArcRaidersClient({
    baseURL: 'https://metaforge.app/api/arc-raiders',
    timeout: 10000,
  });

  try {
    console.log('=== Generating Loot Run Paths ===\n');

    // Example 1: Generate a safe, extraction-aware loot run
    console.log('1. Generating extraction-aware loot run for "dam" map...\n');
    const damLootRun = await client.generateLootRunForMap('dam', {
      startAtSpawn: true,
      endAtExtraction: true,
      maxCaches: 10,
      maxTimeBeforeExtraction: 240, // 4 minutes
      avoidDangerousAreas: true,
      algorithm: 'extraction-aware',
    });

    if (damLootRun) {
      console.log(client.formatLootRunPath(damLootRun));
    } else {
      console.log('No loot run path could be generated for this map.\n');
    }

    // Example 2: Generate loot runs for all maps
    console.log('\n2. Generating loot runs for all available maps...\n');
    const allLootRuns = await client.generateLootRunsForAllMaps({
      startAtSpawn: true,
      endAtExtraction: true,
      maxCaches: 15,
    });

    console.log(`Found ${allLootRuns.length} maps with loot runs:\n`);
    for (const path of allLootRuns) {
      console.log(`- ${path.mapName}: ${path.waypoints.length} waypoints, ${path.totalDistance.toFixed(2)} units`);
    }

    // Example 3: Custom path with specific options
    console.log('\n3. Generating custom loot run for "spaceport"...\n');
    const customRun = await client.generateLootRunForMap('spaceport', {
      startAtSpawn: false, // Don't require spawn point
      endAtExtraction: false, // Don't require extraction point
      maxCaches: 5, // Only visit 5 caches
      algorithm: 'nearest-neighbor',
    });

    if (customRun) {
      console.log(client.formatLootRunPath(customRun));
      
      // Access individual waypoints
      console.log('\nWaypoint Details:');
      customRun.waypoints.forEach((wp, index) => {
        const coords = wp.coordinates;
        console.log(
          `${index + 1}. ${wp.name} (${wp.type}) at (${coords.x}, ${coords.y}${coords.z ? `, ${coords.z}` : ''})`
        );
      });
    }

  } catch (error) {
    console.error('Error generating loot runs:', error);
  }
}

/**
 * Example: Compare different path algorithms
 */
async function compareAlgorithmsExample() {
  const client = createArcRaidersClient();

  try {
    const mapName = 'dam';
    console.log(`\n=== Comparing Algorithms for ${mapName} ===\n`);

    const algorithms: Array<'nearest-neighbor' | 'greedy'> = ['nearest-neighbor', 'greedy'];

    for (const algorithm of algorithms) {
      const path = await client.generateLootRunForMap(mapName, {
        algorithm,
        maxCaches: 10,
        startAtSpawn: true,
        endAtExtraction: true,
      });

      if (path) {
        console.log(`${algorithm.toUpperCase()}:`);
        console.log(`  Distance: ${path.totalDistance.toFixed(2)} units`);
        console.log(`  Waypoints: ${path.waypoints.length}`);
        if (path.estimatedTime) {
          console.log(`  Estimated Time: ${Math.round(path.estimatedTime)}s`);
        }
        console.log();
      }
    }
  } catch (error) {
    console.error('Error comparing algorithms:', error);
  }
}

async function main() {
  await lootRunExample();
  await compareAlgorithmsExample();
}

if (require.main === module) {
  main().catch(console.error);
}

export { lootRunExample, compareAlgorithmsExample };

