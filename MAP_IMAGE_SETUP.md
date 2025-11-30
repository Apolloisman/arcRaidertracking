# Setting Up Map Image Overlay

## How to Use the Actual Game Map

The loot run generator can overlay paths on the actual game map image. Here's how to set it up:

### Step 1: Save the Map Image

1. Take a screenshot or download the map image from the game
2. Save it in the `arc-raiders-wrapper` folder with the name:
   - `map-dam.png` for the dam map
   - `map-spaceport.png` for spaceport
   - `map-buried-city.png` for buried-city
   - `map-blue-gate.png` for blue-gate

### Step 2: Calibration (Optional but Recommended)

To ensure accurate overlay, you can calibrate using a known waypoint:

1. Find a recognizable location on the map (e.g., "The Dam" center, a specific building)
2. Note its pixel position on the image (x, y in pixels)
3. Find the same location in the API data to get its coordinates
4. Update the `referencePoint` in `run-loot.js`:

```javascript
referencePoint: {
  coord: { x: 3000, y: 2250 },  // API coordinates
  pixel: { x: 600, y: 450 },    // Pixel position on image
}
```

### Step 3: Adjust Map Bounds

If the overlay doesn't align correctly, adjust the map bounds in `run-loot.js`:

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

### Current Status

The overlay system is ready! It will:
- ✅ Use the map image if `map-<name>.png` exists
- ✅ Show a placeholder if the image isn't found
- ✅ Overlay waypoints and path lines on the map
- ✅ Use coordinate transformation based on map bounds

### Testing Calibration

1. Run: `node run-loot.js dam 2000 3000`
2. Open `loot-run-dam.html` in your browser
3. Check if waypoints align with actual locations
4. If not aligned, adjust the `referencePoint` or `MAP_BOUNDS` values

