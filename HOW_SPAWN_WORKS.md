# How Spawn Detection Works

## The Issue

The loot run generator **doesn't automatically know where you spawned**. It uses spawn point data from the map API, which may not match your actual spawn location.

## How It Works

### Default Behavior (No Coordinates Provided)

When you run:
```bash
npx arc-raiders loot-run dam
```

The system:
1. Gets map data from the API
2. Finds spawn waypoints in the map data
3. Uses the **first spawn point** it finds as the starting location
4. Generates a path from that spawn point

**Problem:** You might have spawned at a different spawn point, or the game might have multiple spawn locations that aren't all in the API data.

### Solution: Provide Your Coordinates

If you know your spawn coordinates (check your in-game position), you can provide them:

```bash
npx arc-raiders loot-run dam --spawn-x 100.5 --spawn-y 200.3 --spawn-z 15.2
```

This will:
1. Start the path from **your exact position**
2. Generate a more accurate path based on where you actually are
3. Calculate distances correctly from your real spawn point

## Finding Your Coordinates

The game may show coordinates in:
- The map/minimap
- Debug/developer mode
- UI elements
- Or you might need to estimate based on landmarks

If coordinates aren't available, the default spawn point path will still work - you'll just need to adjust the first step to match where you actually spawned.

## Best Practice

1. **Spawn in-game**
2. **Check your coordinates** (if available)
3. **Run the command with your coordinates:**
   ```bash
   npx arc-raiders loot-run <map> --spawn-x X --spawn-y Y --spawn-z Z
   ```
4. **Follow the path** starting from step 2 (skip step 1 if you're already at your spawn)

## Alternative: Manual Adjustment

If you can't get coordinates:
1. Run the command without coordinates
2. Look at the first waypoint in the output
3. If it doesn't match where you spawned, just start from step 2 (the first cache)
4. The path will still be optimized, just starting from a different point

