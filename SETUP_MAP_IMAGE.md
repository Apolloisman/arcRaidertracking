# Setting Up Map Image Overlay

## Quick Setup

To overlay the loot run path on the actual game map:

### Step 1: Save the Map Image

1. Grab a clean PNG of the map (screenshot or export).
2. Drop it in the `arc-raiders-wrapper` folder using the naming scheme **`map-<map name>.png`** (e.g. `map-dam.png`, `map-spaceport.png`, etc.).

### Step 2: Let the Generator Calibrate Automatically

`run-loot.cjs` now reads the PNG size and derives coordinate bounds from the cached map data (spawn points, POIs, loot caches). You no longer have to hard-code `MAP_BOUNDS`. The overlay footer will report which bounds were used and how many spawn references were available.

If you prefer to double-check the raw data:

```bash
node show-locations.cjs <map>
```

This prints every spawn/extraction for the chosen map directly from the local cache (no extra API calls if data is cached).

### Step 3: (Optional) Manual Reference Points

If you still want to pin custom anchors (e.g. for a heavily cropped PNG), capture pixel coordinates for at least two known in-game coordinates and update `generateMapOverlay` to include those additional reference points. The more accurate the anchor set, the tighter the overlay.

## Spawn Reference Coordinates

Use these when checking alignment or picking calibration anchors. Coordinates are pulled straight from the cached ARC Raiders map data, so they already use the correct map scale.

### Dam

| # | Spawn Name | Coordinates (x, y) |
|---|------------|--------------------|
| 1 | player_spawn | (3749.0, 4008.9) |
| 2 | player_spawn | (5349.7, 2208.3) |
| 3 | player_spawn | (3220.2, 1245.8) |
| 4 | player_spawn | (4992.8, 3953.8) |
| 5 | player_spawn | (3718.8, 3396.0) |
| 6 | player_spawn | (5183.0, 3517.0) |
| 7 | player_spawn | (3794.8, 1277.0) |
| 8 | player_spawn | (4465.9, 3985.8) |
| 9 | player_spawn | (4662.9, 1140.1) |
| 10 | player_spawn | (2502.9, 2792.0) |
| 11 | player_spawn | (4213.0, 1019.1) |
| 12 | player_spawn | (4221.9, 2806.0) |
| 13 | player_spawn | (4169.9, 2743.0) |
| 14 | player_spawn | (4742.7, 2008.1) |
| 15 | player_spawn | (2799.9, 1557.0) |
| 16 | player_spawn | (5314.8, 1611.0) |
| 17 | player_spawn | (2509.5, 2214.6) |
| 18 | Under Ground Tunnel | (4978.0, 1422.3) |
| 19 | player_spawn | (3004.1, 3590.6) |
| 20 | player_spawn | (3361.9, 3879.2) |
| 21 | player_spawn | (2799.4, 3256.2) |

### Spaceport

| # | Spawn Name | Coordinates (x, y) |
|---|------------|--------------------|
| 1 | player_spawn | (2551.2, 1217.9) |
| 2 | player_spawn | (2972.0, 866.0) |
| 3 | player_spawn | (3411.1, 1056.6) |
| 4 | player_spawn | (3945.7, 1025.5) |
| 5 | player_spawn | (3658.6, 1615.4) |
| 6 | player_spawn | (4696.6, 1614.0) |
| 7 | Near great-mullein | (4464.7, 1822.0) |
| 8 | Near prickly-pear | (5273.6, 2117.6) |
| 9 | player_spawn | (5160.5, 2506.7) |
| 10 | Near field_crate | (5062.9, 2823.6) |
| 11 | Near field_crate | (5123.7, 3389.4) |
| 12 | player_spawn | (4560.8, 3835.1) |
| 13 | Near field_crate | (4152.1, 3586.1) |
| 14 | player_spawn | (3422.4, 3010.3) |
| 15 | player_spawn | (3081.6, 3318.7) |
| 16 | Near field_crate | (2828.4, 2451.5) |
| 17 | player_spawn | (2620.5, 1874.3) |
| 18 | player_spawn | (2832.7, 1649.4) |
| 19 | Near Departures Hatch | (4147.0, 2195.6) |
| 20 | Fuel Lines Player Spawn | (2877.9, 2911.9) |
| 21 | Near field_crate | (3631.0, 3572.8) |

### Buried City

| # | Spawn Name | Coordinates (x, y) |
|---|------------|--------------------|
| 1 | player_spawn | (8723.2, 6543.3) |
| 2 | player_spawn | (8106.2, 6362.4) |
| 3 | Near Buried City Residential Master Key | (8023.6, 5877.7) |
| 4 | Near supply_station | (6991.0, 5600.0) |
| 5 | player_spawn | (5007.7, 5700.1) |
| 6 | player_spawn | (5174.2, 4592.8) |
| 7 | player_spawn | (6740.9, 3868.6) |
| 8 | player_spawn | (7960.6, 3187.6) |
| 9 | player_spawn | (9387.6, 5449.1) |
| 10 | player_spawn | (8522.5, 3588.5) |
| 11 | player_spawn | (7074.6, 2792.3) |
| 12 | Near Search for Tian Wen's Cache | (6346.8, 3128.9) |
| 13 | Near Great Mullein | (7809.8, 3897.5) |
| 14 | player_spawn | (7588.9, 4913.9) |
| 15 | Near Eyes on the Prize | (6685.7, 6540.6) |
| 16 | Near raider_camp | (5718.1, 6163.6) |
| 17 | Near raider_camp | (7557.6, 6994.4) |
| 18 | Field Crate Spawn | (9272.1, 5403.7) |
| 19 | West Village: Piazza Roma | (6388.4, 4666.4) |
| 20 | Player Spawn | (6421.7, 5603.5) |

### Blue Gate

| # | Spawn Name | Coordinates (x, y) |
|---|------------|--------------------|
| 1 | player_spawn | (9555.9, 4180.4) |
| 2 | player_spawn | (6224.7, 7082.4) |
| 3 | player_spawn | (8516.6, 3309.8) |
| 4 | player_spawn | (9340.0, 6268.0) |
| 5 | player_spawn | (8284.5, 6451.4) |
| 6 | Spawn | (6858.9, 3246.8) |
| 7 | player_spawn | (7201.2, 7749.9) |
| 8 | player_spawn | (5379.7, 6013.2) |
| 9 | Near olive | (7987.0, 3168.1) |
| 10 | Player Spawn | (4628.0, 5368.6) |
| 11 | Near Nail Down Roof Plates | (5531.0, 4596.3) |
| 12 | player_spawn | (5364.1, 2810.0) |
| 13 | Village Spawn Point | (7170.4, 3110.0) |
| 14 | player_spawn | (4432.1, 4462.5) |
| 15 | Near bees | (6259.3, 6467.2) |
| 16 | Village Shed Spawn | (6033.5, 2845.9) |
| 17 | player_spawn | (9554.4, 4811.2) |
| 18 | Near lemons | (5618.5, 5099.4) |
| 19 | South Forest Spawn | (5096.8, 6027.4) |
| 20 | player_spawn | (5040.0, 3350.0) |

## Testing

After setting up:

1. Run: `node run-loot.cjs dam 2000 3000`
2. Open `loot-run-dam.html` in your browser (the batch script will auto-open it for you now).
3. Check if waypoints align with actual map locations. If they drift, use additional spawn anchors or crop the PNG consistently.

## Current Status

✅ Map overlay system is ready
✅ Will automatically use `map-dam.png` if it exists
✅ Uses reference point calibration for accuracy
✅ Shows placeholder if image not found (path still works)

