# Setting Up Map Image Overlay

## Quick Setup

To overlay the loot run path on the actual game map:

### Step 1: Save the Map Image

1. Save the map image you showed me (or take a screenshot of the game map)
2. Save it in the `arc-raiders-wrapper` folder as: **`map-dam.png`**

### Step 2: Calibrate Using a Reference Waypoint

The overlay uses a reference point to ensure accurate alignment. To calibrate:

1. **Find a recognizable location** on the map (e.g., "The Dam" center, a specific building)
2. **Note its pixel position** on the image (x, y in pixels)
3. **Find the same location** in your loot run output to get its API coordinates
4. **Update the reference point** in `run-loot.cjs`:

Open `run-loot.cjs` and find the `MAP_BOUNDS` section around line 158. Update:

```javascript
referencePoint: {
  coord: { x: 3000, y: 2250 },  // API coordinates from your loot run
  pixel: { x: 600, y: 450 },    // Pixel position on the map image
}
```

### Step 3: Adjust Map Bounds (if needed)

If waypoints don't align correctly, adjust the map bounds:

```javascript
const MAP_BOUNDS = {
  dam: {
    minX: 0,      // Minimum X coordinate from API
    maxX: 6000,   // Maximum X coordinate from API  
    minY: 0,      // Minimum Y coordinate from API
    maxY: 4500,   // Maximum Y coordinate from API
    imageWidth: 1200,   // Your image width in pixels
    imageHeight: 900,   // Your image height in pixels
  }
};
```

## How to Find a Reference Point

1. Run: `node run-loot.cjs dam 2000 3000`
2. Look at the waypoint coordinates in the output
3. Find that location on your map image
4. Note the pixel position (you can use an image editor or browser dev tools)
5. Update the `referencePoint` with those values

## Testing

After setting up:

1. Run: `node run-loot.cjs dam 2000 3000`
2. Open `loot-run-dam.html` in your browser
3. Check if waypoints align with actual map locations
4. If not aligned, adjust the `referencePoint` or `MAP_BOUNDS` values

## Current Status

✅ Map overlay system is ready
✅ Will automatically use `map-dam.png` if it exists
✅ Uses reference point calibration for accuracy
✅ Shows placeholder if image not found (path still works)

