# Loot Run Pathfinding Feature

## Overview

This feature adds the ability to generate optimized loot run paths for Arc Raiders maps. It uses the map data from the API (waypoints, POIs, and coordinates) to create efficient routes for collecting loot.

## How It Works

1. **Map Data**: The API provides `MapData` which includes:
   - `waypoints`: Spawn points, extraction points, objectives, vendors
   - `pois` (Points of Interest): Including `'cache'` type which are loot locations
   - `coordinates`: X, Y, Z coordinates for all locations

2. **Path Generation**: The algorithm:
   - Extracts all cache POIs (loot locations) from the map
   - Optionally starts at a spawn point
   - Uses nearest-neighbor algorithm to visit caches efficiently
   - Optionally ends at an extraction point
   - Calculates total distance and estimated time

3. **Algorithms**: Currently supports:
   - `nearest-neighbor`: Greedy algorithm that always visits the closest unvisited cache
   - `greedy`: Alias for nearest-neighbor (same algorithm)

## Usage

### Basic Example

```typescript
import { createArcRaidersClient } from '@justinjd00/arc-raiders-api';

const client = createArcRaidersClient();

// Generate a loot run for a specific map
const lootRun = await client.generateLootRunForMap('dam', {
  startAtSpawn: true,
  endAtExtraction: true,
  maxCaches: 10,
  algorithm: 'nearest-neighbor',
});

if (lootRun) {
  console.log(client.formatLootRunPath(lootRun));
}
```

### Options

- `startAtSpawn` (boolean): Start the path at a spawn point if available
- `endAtExtraction` (boolean): End the path at an extraction point if available
- `maxCaches` (number): Maximum number of loot caches to visit
- `algorithm` ('nearest-neighbor' | 'greedy'): Pathfinding algorithm to use

### Output

The `LootRunPath` object contains:
- `mapId`: ID of the map
- `mapName`: Name of the map
- `waypoints`: Array of path waypoints in order
- `totalDistance`: Total distance of the path in coordinate units
- `estimatedTime`: Estimated time to complete (in seconds)

Each waypoint includes:
- `id`: Unique identifier
- `name`: Display name
- `coordinates`: X, Y, Z coordinates
- `type`: 'spawn', 'cache', 'extraction', or 'other'
- `order`: Order in the path (0-indexed)

## Implementation Details

### Files Added

- `src/pathfinding/loot-run.ts`: Core pathfinding logic
- `examples/loot-run-example.ts`: Usage examples

### Files Modified

- `src/arc-raiders/client.ts`: Added `generateLootRunForMap()`, `generateLootRunsForAllMaps()`, and `formatLootRunPath()` methods
- `src/index.ts`: Exported new types and functions
- `README.md`: Added documentation

### Algorithm

The nearest-neighbor algorithm:
1. Starts at spawn point (if `startAtSpawn` is true)
2. For each iteration, finds the nearest unvisited cache
3. Adds it to the path
4. Repeats until `maxCaches` is reached or no more caches available
5. Ends at extraction point (if `endAtExtraction` is true)

### Distance Calculation

Uses Euclidean distance in 3D space:
```
distance = √((x₁-x₂)² + (y₁-y₂)² + (z₁-z₂)²)
```

## Future Enhancements

Potential improvements:
- More sophisticated algorithms (TSP solvers, A* pathfinding)
- Consider terrain/obstacles if data becomes available
- Weight caches by rarity/value if API provides that data
- Multiple path options (shortest, most caches, highest value)
- Export paths to JSON/CSV for external tools
- Visual path rendering (if map images are available)

## Limitations

- Currently relies on API providing accurate coordinate data
- No terrain/obstacle avoidance (assumes direct paths)
- No consideration of cache value/rarity (treats all caches equally)
- Time estimation is rough (assumes constant movement speed)

