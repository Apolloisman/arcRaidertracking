# Quick Start: Loot Runs

## Easy Way to Use (CLI)

**Option 1: Use known spawn point (default)**
```bash
npx arc-raiders loot-run <map-name>
```
This uses the first spawn point from the map data. If you spawned elsewhere, use Option 2.

**Option 2: Specify your exact spawn coordinates**
Once you spawn in-game, check your coordinates (if the game shows them), then run:

```bash
npx arc-raiders loot-run dam --spawn-x 100.5 --spawn-y 200.3 --spawn-z 15.2
```

**Note:** The system doesn't automatically detect where you spawned - it uses known spawn points from the map data. If you spawned at a different location, you can provide your coordinates to get a more accurate path.

### Available Maps:
- `dam`
- `spaceport`
- `buried-city`
- `blue-gate`

### Examples:

**Basic loot run:**
```bash
npx arc-raiders loot-run dam
```

**Customized run (10 caches, 4 minutes max):**
```bash
npx arc-raiders loot-run spaceport --max-caches 10 --max-time 240
```

**Safe run (avoid dangerous areas):**
```bash
npx arc-raiders loot-run buried-city --avoid-dangerous
```

**Use raider key extraction:**
```bash
npx arc-raiders loot-run dam --use-raider-key
```

**Custom danger detection:**
```bash
npx arc-raiders loot-run spaceport --avoid-dangerous --danger-radius 75
```

## What You'll Get

The tool will generate step-by-step instructions like:

```
╔═══════════════════════════════════════════════════════════╗
║  LOOT RUN: DAM                                            ║
╚═══════════════════════════════════════════════════════════╝

📊 STATS:
   • Total Distance: 450.23 units
   • Estimated Time: 1m 30s
   • Waypoints: 8

🗺️  STEP-BY-STEP INSTRUCTIONS:
═══════════════════════════════════════════════════════════

🚀 STEP 1: Start at spawn point: Main Spawn
   Location: Main Spawn
   Coordinates: (100.5, 200.3, 15.2)
   Distance to extraction: 250.0 units

📦 STEP 2: Loot Cache Alpha (safe zone - near extraction)
   Location: Cache Alpha
   Coordinates: (150.2, 180.5, 14.8)
   Distance to extraction: 80.5 units 🟢 SAFE ZONE

...
```

## Features

✅ **Extraction-Aware**: Prioritizes staying near extraction points
✅ **Time Management**: Stops looting before time runs out
✅ **Danger Avoidance**: Can avoid objectives/dangerous areas
✅ **Easy Instructions**: Step-by-step guide you can follow in-game

## Options

- `--max-caches <number>`: Maximum caches to visit (default: 15)
- `--max-time <seconds>`: Max time before heading to extraction (default: 300 = 5 min)
- `--extraction-proximity <number>`: Max distance from extraction to loot (default: 100 units)
- `--avoid-dangerous`: Avoid dangerous areas (objectives)

## Tips

1. **Run the command right after spawning** - The path starts from your spawn point
2. **Follow the steps in order** - They're optimized for efficiency
3. **Watch for safe zones** - 🟢 SAFE ZONE means you're near extraction
4. **If you see enemies** - Head to extraction immediately, don't finish the path
5. **Adjust max-time** - If you want shorter runs, use `--max-time 180` (3 minutes)

## Programmatic Usage

If you want to use this in your own code:

```typescript
import { createArcRaidersClient } from '@justinjd00/arc-raiders-api';

const client = createArcRaidersClient();

const lootRun = await client.generateLootRunForMap('dam', {
  startAtSpawn: true,
  endAtExtraction: true,
  maxCaches: 10,
  maxTimeBeforeExtraction: 240, // 4 minutes
  avoidDangerousAreas: true,
  algorithm: 'extraction-aware',
});

console.log(client.formatLootRunPath(lootRun));
```

