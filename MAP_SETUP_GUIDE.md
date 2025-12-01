# Complete Guide: Generating Your Map Image and Placing Coordinates

## Overview

This guide explains the complete process for creating a map image and having the system automatically place all coordinates (icons, paths, waypoints) on it.

## Step 1: Get Your Map Image

### Option A: Screenshot from Game
1. Open the in-game map (full screen if possible)
2. Take a screenshot or export the map
3. Save as PNG format

### Option B: Export from Map Tool
1. Use any map tool or website that shows the game map
2. Export or screenshot the full map
3. Save as PNG format

### Option C: Create from Scratch
1. Use image editing software (Photoshop, GIMP, etc.)
2. Create a blank canvas
3. Draw or import the map layout
4. Save as PNG format

## Step 2: Determine Image Size

The system works with **any image size**, but for best results, match the aspect ratio of the coordinate system.

### Check Coordinate Aspect Ratio

Run this command to see the recommended dimensions:

```bash
node check-map-bounds.cjs
```

This will show:
- Coordinate ranges for each map
- Aspect ratio (width:height)
- Recommended image dimensions

**Example Output:**
```
Map: DAM
   X: 2502.87 to 5483.49 (range: 2980.62)
   Y: 1019.13 to 4269.88 (range: 3250.75)
   Aspect Ratio: 0.917:1 (91.7% wider than tall)
   Recommended: 1100px × 1200px
```

### Image Size Guidelines

- **Minimum**: 800px × 800px (works but may be pixelated)
- **Recommended**: 1200px × 1200px or larger
- **Aspect Ratio**: Match the coordinate system's aspect ratio for best results
- **Format**: PNG (supports transparency if needed)

## Step 3: Save the Map Image

1. Save your map image in the `arc-raiders-wrapper` folder
2. Name it: `map-<mapname>.png`
   - Examples: `map-dam.png`, `map-spaceport.png`, `map-buried-city.png`, `map-blue-gate.png`
3. Make sure it's a clean map (no UI overlays, player markers, etc.)

## Step 4: How Coordinate Placement Works

The system **automatically** places all coordinates on your map using this process:

### Automatic Calibration Process

1. **Reads your map image size**
   - Detects width and height automatically

2. **Gets coordinate data from API**
   - Fetches all waypoints, POIs, spawn points, extraction points
   - Uses cached data (cached for 7 days to minimize API calls)

3. **Calculates coordinate bounds**
   - Finds min/max X and Y from all coordinates
   - Calculates the center of the coordinate system
   - Example: If coordinates range from X: 2500-5500, Y: 1000-4300
     - Center = (4000, 2650)
     - Span = (3000, 3300)

4. **Maps coordinates to pixels**
   - Centers the coordinate system in the image
   - Maps coordinate center → image center
   - Scales based on coordinate span vs image size
   - Formula: `pixelX = (imageWidth/2) + (coordX - centerX) * scaleX`
   - Formula: `pixelY = (imageHeight/2) - (coordY - centerY) * scaleY` (Y flipped)

5. **Places all icons**
   - Every waypoint and POI gets an icon at its calculated pixel position
   - Uses generated icons from `icons-pathfinding/` folders
   - Falls back to colored circles if icon not found

### Coordinate System Details

- **Origin (0,0)**: Not typically in the playable area
- **Actual Range**: Coordinates usually start around 2000-4000
- **Center-Based**: System centers around the actual coordinate center
- **Full Coverage**: Maps the entire coordinate range to fill the entire image

## Step 5: Verify Placement

### Run the Generator

```bash
node run-loot.cjs <mapname> [coordinates]
```

Or use the batch file:
```bash
quick-run.bat
```

### Check Console Output

The system will show:
```
📊 Map bounds: X(2502-5483) Y(1019-4269)
   Center: (3992, 2644)
   Calculated from 1050 coordinates
   Using actual coordinate range to fill entire image
   Image size: 1200x1200px
✅ Using 4 reference points for calibration:
   1. Coord (3749, 4008) -> Pixel (450, 350)
   2. Coord (5349, 2208) -> Pixel (850, 650)
   ...
✅ Rendered 1050 icons on map
```

### Open the HTML File

1. The script generates `loot-run-<mapname>.html`
2. Open it in your browser (auto-opens if using `quick-run.bat`)
3. Check if icons align with map locations

## Step 6: Troubleshooting Placement Issues

### Icons are shifted/misaligned

**Possible causes:**
1. Map image doesn't match coordinate system
2. Map image is cropped or scaled differently
3. Coordinate system origin doesn't match image origin

**Solutions:**

#### Option A: Use Known Reference Points

If you know where specific coordinates are on your map image:

1. Identify 2-3 known locations on your map
2. Note their in-game coordinates
3. Note their pixel positions on your image
4. The system will use spawn points automatically, but you can add manual calibration

#### Option B: Adjust Image

1. Ensure your map image shows the **full playable area**
2. Don't crop important edges
3. Match the aspect ratio from `check-map-bounds.cjs`

#### Option C: Check Coordinate Ranges

Run:
```bash
node check-map-bounds.cjs
```

Verify your map image covers the full coordinate range shown.

### Icons are missing in the middle

**Solution:** The system now uses center-based mapping, so this should be fixed. If still happening:
- Check console output for bounds
- Verify image covers the full coordinate range
- Ensure map image isn't cropped

### Icons are too small/large

**Solution:** Adjust icon size in code (currently 24px). The system scales icons automatically.

## Step 7: Understanding the Coordinate System

### How Coordinates Map to Pixels

```
Game Coordinates          Image Pixels
─────────────────         ────────────
(0,0) ────────────>       (off-map, off-map)
                         
Center (4000, 2650) ───> Center (600, 600) [if image is 1200×1200]
                         
Max (6000, 4500) ──────>  Edge of image
```

### Coordinate Transformation Formula

```javascript
// Calculate center
centerX = (minX + maxX) / 2
centerY = (minY + maxY) / 2

// Calculate scale
scaleX = imageWidth / (maxX - minX)
scaleY = imageHeight / (maxY - minY)

// Transform coordinate to pixel
pixelX = (imageWidth / 2) + (coordX - centerX) * scaleX
pixelY = (imageHeight / 2) - (coordY - centerY) * scaleY  // Y flipped
```

## Quick Reference

### File Locations
- **Map Images**: `arc-raiders-wrapper/map-<name>.png`
- **Generated HTML**: `arc-raiders-wrapper/loot-run-<name>.html`
- **Icons**: `arc-raiders-wrapper/icons-pathfinding/`
- **Cache**: `arc-raiders-wrapper/.cache/arc-raiders-cache.json`

### Commands
```bash
# Check coordinate ranges and recommended image size
node check-map-bounds.cjs

# View all locations for a map
node show-locations.cjs <mapname>

# Generate loot run with map overlay
node run-loot.cjs <mapname> [x] [y]

# Quick run (shows locations first)
quick-run.bat
```

### Coordinate System Notes
- Coordinates are **not** centered at (0,0)
- Coordinates typically range from ~2000-6000 for X and Y
- System automatically centers around the actual coordinate center
- All coordinates are placed relative to this center

## Best Practices

1. **Use a clean map image** - No UI, markers, or overlays
2. **Match aspect ratio** - Use recommended dimensions from `check-map-bounds.cjs`
3. **Full coverage** - Include the entire playable area
4. **High resolution** - Use at least 1200×1200px for clarity
5. **PNG format** - Best quality and supports transparency if needed

## Summary

The process is:
1. **Get map image** → Save as `map-<name>.png`
2. **Run generator** → `node run-loot.cjs <mapname>`
3. **System automatically**:
   - Reads image size
   - Gets coordinates from API (cached)
   - Calculates bounds and center
   - Maps all coordinates to pixels
   - Places all icons
4. **Open HTML** → View the overlay
5. **Verify alignment** → Check if icons match map locations

The system handles all the coordinate-to-pixel math automatically - you just need to provide a clean map image!

