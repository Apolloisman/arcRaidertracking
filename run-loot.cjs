#!/usr/bin/env node

/**
 * Simple Loot Run Generator
 * Usage: node run-loot.js <map-name> <x> <y> [z]
 * Example: node run-loot.js dam 2000 3000 15
 */

const { createArcRaidersClient } = require('./dist/index.js');
const fs = require('fs');
const path = require('path');

// __dirname is available in CommonJS, but if not, use process.cwd()
if (typeof __dirname === 'undefined') {
  var __dirname = process.cwd();
}

// Default spawn coordinates (from your earlier run)
const DEFAULT_SPAWN = {
  dam: { x: 1000, y: 3000 },
  spaceport: { x: 1000, y: 3000 },
  'buried-city': { x: 1000, y: 3000 },
  'blue-gate': { x: 1000, y: 3000 },
};

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           ARC RAIDERS LOOT RUN GENERATOR                  ║
╚═══════════════════════════════════════════════════════════╝

Usage: node run-loot.js <map-name> [location]

Arguments:
  map-name    Map to generate path for (dam, spaceport, buried-city, blue-gate)
  location    Your spawn location - can be:
              - Coordinates: "x y" or "x y z" (e.g., "3594.76 2919.88")
              - Landmark name: "water treatment", "dam", etc. (searches map locations)
              - Omit to use saved spawn coordinates

Examples:
  # Use saved spawn coordinates
  node run-loot.js dam
  
  # Use coordinates
  node run-loot.js dam 3594.76 2919.88
  node run-loot.js spaceport 1500 2500 10
  
  # Use landmark name
  node run-loot.js dam "water treatment"
  node run-loot.js dam "dam"

Available maps: dam, spaceport, buried-city, blue-gate

💡 TIP: You can enter a landmark name instead of coordinates!
       A map overlay HTML file will be automatically generated!
    `);
    process.exit(1);
  }

  const mapName = args[0];
  let x, y, z;
  let useCoordinates = false;

  // Helper function to find location by name (searches waypoints and POIs)
  async function findLocationByName(mapName, locationName) {
    try {
      const client = createArcRaidersClient();
      const mapData = await client.getMapData(mapName);
      const searchLower = locationName.toLowerCase();
      
      // Search in waypoints first (preferred)
      const waypointMatch = (mapData.waypoints || []).find(wp => 
        wp.name && wp.name.toLowerCase().includes(searchLower) && wp.coordinates
      );
      if (waypointMatch) return waypointMatch.coordinates;
      
      // Fallback to POIs
      const poiMatch = (mapData.pois || []).find(poi => 
        poi.name && poi.name.toLowerCase().includes(searchLower) && poi.coordinates
      );
      if (poiMatch) return poiMatch.coordinates;
      
      return null;
    } catch (error) {
      console.error('Error searching for location:', error.message);
      return null;
    }
  }

  if (args.length >= 2) {
    const locationArg = args.slice(1).join(' '); // Join all args after map name
    
    // Try parsing as coordinates first
    const coordParts = locationArg.trim().split(/\s+/);
    if (coordParts.length >= 2) {
      x = parseFloat(coordParts[0]);
      y = parseFloat(coordParts[1]);
      z = coordParts[2] ? parseFloat(coordParts[2]) : undefined;
      
      // If both are valid numbers, use as coordinates
      if (!isNaN(x) && !isNaN(y)) {
        if (z !== undefined && isNaN(z)) {
          console.error('❌ Error: Z coordinate must be a number');
          process.exit(1);
        }
        useCoordinates = true;
      } else {
        // Not valid coordinates, try as landmark name
        const coords = await findLocationByName(mapName, locationArg);
        if (coords) {
          x = coords.x;
          y = coords.y;
          z = coords.z;
          useCoordinates = true;
          console.log(`✅ Found: ${locationArg} at (${x.toFixed(2)}, ${y.toFixed(2)}${z !== undefined ? `, ${z.toFixed(2)}` : ''})`);
        } else {
          console.error(`❌ Error: Could not find location "${locationArg}" on map "${mapName}"`);
          console.log('   Try using coordinates instead, or check the location name.');
          process.exit(1);
        }
      }
    } else {
      // Single word, try as landmark
      const coords = await findLocationByName(mapName, locationArg);
      if (coords) {
        x = coords.x;
        y = coords.y;
        z = coords.z;
        useCoordinates = true;
        console.log(`✅ Found: ${locationArg} at (${x.toFixed(2)}, ${y.toFixed(2)}${z !== undefined ? `, ${z.toFixed(2)}` : ''})`);
      } else {
        console.error(`❌ Error: Could not find location "${locationArg}" on map "${mapName}"`);
        console.log('   Try using coordinates instead, or check the location name.');
        process.exit(1);
      }
    }
  } else {
    // Use default spawn coordinates
    const defaultSpawn = DEFAULT_SPAWN[mapName] || DEFAULT_SPAWN.dam;
    x = defaultSpawn.x;
    y = defaultSpawn.y;
    useCoordinates = true;
    console.log(`📍 Using saved spawn coordinates: (${x}, ${y})`);
  }

  console.log('\n🔄 Generating loot run...\n');
  if (useCoordinates) {
    console.log(`📍 Starting location: (${x}, ${y}${z !== undefined ? `, ${z}` : ''})`);
  } else {
    console.log(`📍 Using nearest spawn point (no coordinates needed!)`);
  }
  console.log(`🗺️  Map: ${mapName}\n`);

  try {
    const client = createArcRaidersClient();

    const options = {
      startAtSpawn: !useCoordinates, // Use spawn point if no coordinates
      startAtCoordinates: useCoordinates ? {
        x,
        y,
        ...(z !== undefined && { z }),
      } : undefined,
      endAtExtraction: true,
      maxCaches: 6, // 6 loot locations (can include ARCs for quests)
      avoidDangerousAreas: true,
      algorithm: 'extraction-aware',
      maxTimeBeforeExtraction: 300, // 5 minutes
      avoidPlayerInterception: true, // Avoid paths that other players can intercept
      playerMovementSpeed: 5, // Units per second
      roundDuration: 1800, // 30 minutes total round
      lateSpawnWindow: { min: 960, max: 1200 }, // 16-20 minutes late spawn window
    };

    const lootRun = await client.generateLootRunForMap(mapName, options);

    if (!lootRun) {
      console.error(`\n❌ Could not generate loot run for map "${mapName}"`);
      console.log('   Make sure the map name is correct.');
      process.exit(1);
    }

    console.log(client.formatLootRunPath(lootRun));
    
    // Automatically generate map overlay
    console.log('\n🔄 Generating map overlay...');
    generateMapOverlay(lootRun, mapName);
    
  } catch (error) {
    console.error('\n❌ Error generating loot run:', error.message);
    if (error.message.includes('API')) {
      console.log('\n💡 Tip: The API might be temporarily unavailable. Try again in a moment.');
    }
    process.exit(1);
  }
}

function getMapImagePath(mapName) {
  // Check if map image file exists in current directory
  const imagePath = path.join(__dirname, `map-${mapName}.png`);
  if (fs.existsSync(imagePath)) {
    // Use relative path instead of base64 for better performance
    // The HTML file will be in the same directory as the image
    return `map-${mapName}.png`;
  }
  // Return placeholder if image doesn't exist
  const placeholder = `<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="900" fill="#2a2a2a"/>
    <text x="600" y="400" text-anchor="middle" fill="#888" font-size="20">Map Image Not Found</text>
    <text x="600" y="430" text-anchor="middle" fill="#666" font-size="14">Save map image as: map-${mapName}.png in this folder</text>
    <text x="600" y="460" text-anchor="middle" fill="#666" font-size="12">Path overlay will still work with coordinate system</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(placeholder).toString('base64')}`;
}

function generateMapOverlay(lootRun, mapName) {
  try {
    // Map coordinate bounds - calibrated based on actual game map
    // These need to match the actual map image coordinate system
    // Using a reference waypoint to ensure proper alignment
    const MAP_BOUNDS = {
      dam: {
        // Based on API data analysis - dam map coordinates
        // Need to calibrate using a known waypoint location
        minX: 0,
        maxX: 6000,
        minY: 0,
        maxY: 4500,
        // Map image dimensions - adjust based on actual image size
        // The map image appears to be roughly 1200x900 or similar
        imageWidth: 1200,
        imageHeight: 900,
        // Reference point for calibration - using a known location
        // Example: If "The Dam" center is at pixel (600, 300) on the image
        // and corresponds to coordinates (3000, 2250), we can calibrate
        // For now, using full bounds - will be calibrated when image is loaded
        referencePoint: {
          // Known location: "The Dam" area center
          coord: { x: 3000, y: 2250 }, // Approximate center of dam map
          pixel: { x: 600, y: 450 },   // Approximate center of image
        }
      }
    };
    
    const bounds = MAP_BOUNDS[mapName] || MAP_BOUNDS.dam;
    
    // Calculate coordinate to pixel transformation
    // Using reference point for calibration if available
    const coordToPixel = (coord) => {
      let pixelX, pixelY;
      
      if (bounds.referencePoint) {
        // Use reference point for more accurate calibration
        const ref = bounds.referencePoint;
        const scaleX = bounds.imageWidth / (bounds.maxX - bounds.minX);
        const scaleY = bounds.imageHeight / (bounds.maxY - bounds.minY);
        
        // Calculate offset from reference point
        const offsetX = (coord.x - ref.coord.x) * scaleX;
        const offsetY = (coord.y - ref.coord.y) * scaleY;
        
        pixelX = ref.pixel.x + offsetX;
        pixelY = ref.pixel.y - offsetY; // Flip Y axis
      } else {
        // Fallback to simple normalization
        let normalizedX = (coord.x - bounds.minX) / (bounds.maxX - bounds.minX);
        let normalizedY = (coord.y - bounds.minY) / (bounds.maxY - bounds.minY);
        
        normalizedX = Math.max(0, Math.min(1, normalizedX));
        normalizedY = Math.max(0, Math.min(1, normalizedY));
        
        pixelX = normalizedX * bounds.imageWidth;
        pixelY = (1 - normalizedY) * bounds.imageHeight; // Flip Y axis
      }
      
      return { x: pixelX, y: pixelY };
    };
    
    // Get all coordinates for bounds calculation
    const allCoords = lootRun.waypoints.map(wp => wp.coordinates);
    const minX = Math.min(...allCoords.map(c => c.x));
    const maxX = Math.max(...allCoords.map(c => c.x));
    const minY = Math.min(...allCoords.map(c => c.y));
    const maxY = Math.max(...allCoords.map(c => c.y));

    // Generate HTML
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loot Run: ${lootRun.mapName}</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #1a1a1a;
            color: #e0e0e0;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #4a9eff;
            margin-bottom: 10px;
        }
        .stats {
            background: #2a2a2a;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .stats p {
            margin: 5px 0;
        }
        .map-container {
            background: #2a2a2a;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .map-overlay-wrapper {
            position: relative;
            display: block;
            width: 100%;
        }
        .map-overlay-wrapper img {
            display: block;
            width: 100%;
            height: auto;
            position: relative;
            z-index: 1;
        }
        .path-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 2;
            background: none !important;
        }
        .map-overlay-wrapper {
            position: relative;
            display: inline-block;
            width: 100%;
        }
        .map-overlay-wrapper img {
            display: block;
            width: 100%;
            height: auto;
            position: relative;
            z-index: 1;
        }
        .map-overlay-wrapper svg {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 2;
            background: transparent !important;
        }
        .waypoint-line {
            stroke: #4a9eff;
            stroke-width: 3;
            fill: none;
            opacity: 0.7;
        }
        .waypoint {
            cursor: pointer;
        }
        .waypoint-spawn {
            fill: #00ff00;
            stroke: #ffffff;
            stroke-width: 2;
        }
        .waypoint-cache {
            fill: #ffaa00;
            stroke: #ffffff;
            stroke-width: 2;
        }
        .waypoint-extraction {
            fill: #ff0000;
            stroke: #ffffff;
            stroke-width: 2;
        }
        .waypoint-raider-key {
            fill: #ff00ff;
            stroke: #ffffff;
            stroke-width: 2;
        }
        .waypoint-label {
            fill: #ffffff;
            font-size: 12px;
            font-weight: bold;
            text-anchor: middle;
            pointer-events: none;
        }
        .legend {
            background: #2a2a2a;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
        }
        .legend-item {
            display: flex;
            align-items: center;
            margin: 8px 0;
        }
        .legend-color {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            margin-right: 10px;
            border: 2px solid #ffffff;
        }
        .waypoints-list {
            background: #2a2a2a;
            padding: 15px;
            border-radius: 8px;
        }
        .waypoint-item {
            padding: 10px;
            margin: 5px 0;
            background: #1e1e1e;
            border-radius: 4px;
            border-left: 4px solid #4a9eff;
        }
        .waypoint-item h4 {
            margin: 0 0 5px 0;
            color: #4a9eff;
        }
        .waypoint-item p {
            margin: 3px 0;
            font-size: 14px;
            color: #b0b0b0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🗺️ Loot Run: ${lootRun.mapName.toUpperCase()}</h1>
        
        <div class="stats">
            <p><strong>Total Distance:</strong> ${lootRun.totalDistance.toFixed(2)} units</p>
            <p><strong>Estimated Time:</strong> ${lootRun.estimatedTime ? Math.round(lootRun.estimatedTime / 60) + 'm ' + Math.round(lootRun.estimatedTime % 60) + 's' : 'N/A'}</p>
            <p><strong>Waypoints:</strong> ${lootRun.waypoints.length}</p>
        </div>

        <div class="map-container">
            <h2>Path Visualization</h2>
            <div class="map-overlay-wrapper" style="max-width: ${bounds.imageWidth}px; margin: 0 auto;">
                <!-- Map image as background -->
                <img id="mapImage" src="${getMapImagePath(mapName)}" 
                     alt="Map" 
                     style="width: 100%; height: auto; display: block; border: 2px solid #3a3a3a; border-radius: 4px;"
                     onload="calibrateOverlay(); console.log('Map image loaded:', this.naturalWidth, 'x', this.naturalHeight);"
                     onerror="console.error('Failed to load map image. Make sure map-dam.png is in the same folder as this HTML file. Path:', this.src)" />
                
                <!-- Overlay SVG for path -->
                <svg class="path-overlay"
                     viewBox="0 0 ${bounds.imageWidth} ${bounds.imageHeight}" 
                     preserveAspectRatio="xMidYMid meet"
                     xmlns="http://www.w3.org/2000/svg">
                    <!-- Draw path lines -->
                    ${lootRun.waypoints.map((wp, i) => {
                      if (i === 0) return '';
                      const prev = lootRun.waypoints[i - 1];
                      const prevPx = coordToPixel(prev.coordinates);
                      const currPx = coordToPixel(wp.coordinates);
                      return `<line class="waypoint-line" x1="${prevPx.x}" y1="${prevPx.y}" x2="${currPx.x}" y2="${currPx.y}" />`;
                    }).join('\n                    ')}
                    
                    <!-- Draw waypoints -->
                    ${lootRun.waypoints.map((wp, i) => {
                      const px = coordToPixel(wp.coordinates);
                      const type = wp.type || 'cache';
                      const colorClass = `waypoint-${type}`;
                      const label = i + 1;
                      return `
                        <circle class="waypoint ${colorClass}" cx="${px.x}" cy="${px.y}" r="10" data-step="${i + 1}" data-name="${wp.name}" data-coords="(${wp.coordinates.x.toFixed(1)}, ${wp.coordinates.y.toFixed(1)}${wp.coordinates.z !== undefined ? `, ${wp.coordinates.z.toFixed(1)}` : ''})" />
                        <text class="waypoint-label" x="${px.x}" y="${px.y - 18}" fill="#ffffff" stroke="#000000" stroke-width="0.5">${label}</text>`;
                    }).join('\n                    ')}
                </svg>
            </div>
            <p style="margin-top: 10px; font-size: 12px; color: #888;">
                💡 Reference: Map bounds (${bounds.minX}, ${bounds.minY}) to (${bounds.maxX}, ${bounds.maxY})
                ${bounds.referencePoint ? ` | Calibrated using reference point at (${bounds.referencePoint.coord.x}, ${bounds.referencePoint.coord.y})` : ''}
            </p>
            <p style="margin-top: 5px; font-size: 11px; color: #666;">
                ${bounds.referencePoint ? '✅ Using calibrated coordinate system' : '⚠️ Using estimated bounds - save map image as map-dam.png for better accuracy'}
            </p>
        </div>

        <div class="legend">
            <h3>Legend</h3>
            <div class="legend-item">
                <div class="legend-color" style="background: #00ff00;"></div>
                <span>Spawn Point</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #ffaa00;"></div>
                <span>Loot Cache</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #ff0000;"></div>
                <span>Extraction</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #ff00ff;"></div>
                <span>Raider Key</span>
            </div>
        </div>

        <div class="waypoints-list">
            <h3>Step-by-Step Instructions</h3>
            ${lootRun.waypoints.map((wp, i) => {
              const icon = wp.type === 'spawn' ? '🚀' : wp.type === 'extraction' ? '✈️' : wp.type === 'raider-key' ? '🔑' : '📦';
              const coords = wp.coordinates;
              return `
            <div class="waypoint-item">
                <h4>${icon} Step ${i + 1}: ${wp.instruction || wp.name}</h4>
                <p><strong>Location:</strong> ${wp.name}</p>
                <p><strong>Coordinates:</strong> (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : ''})</p>
                ${wp.distanceToExtraction !== undefined ? `<p><strong>Distance to extraction:</strong> ${wp.distanceToExtraction.toFixed(1)} units</p>` : ''}
                ${wp.dangerLevel && wp.dangerLevel !== 'low' ? `<p><strong>⚠️ Danger:</strong> ${wp.dangerLevel.toUpperCase()}</p>` : ''}
            </div>`;
            }).join('\n            ')}
        </div>
    </div>

    <script>
        // Calibration function - can be used to fine-tune overlay
        function calibrateOverlay() {
            const img = document.getElementById('mapImage');
            if (img) {
                // If image loads, we can adjust bounds based on actual image size
                const actualWidth = img.naturalWidth || ${bounds.imageWidth};
                const actualHeight = img.naturalHeight || ${bounds.imageHeight};
                console.log('Map image loaded:', actualWidth, 'x', actualHeight);
            }
        }
        
        // Add hover effects
        document.querySelectorAll('.waypoint').forEach(point => {
            point.addEventListener('mouseenter', function() {
                this.setAttribute('r', '12');
                const name = this.getAttribute('data-name');
                const coords = this.getAttribute('data-coords');
                // Could show tooltip here
            });
            point.addEventListener('mouseleave', function() {
                this.setAttribute('r', '10');
            });
        });
    </script>
</body>
</html>`;

    // Save HTML file with consistent name
    const filename = `loot-run-${mapName}.html`;
    const filepath = path.join(process.cwd(), filename);
    fs.writeFileSync(filepath, html);

    console.log(`✅ Map overlay saved: ${filename}`);
    console.log(`💡 Open ${filename} in your browser to view the visual map!`);
  } catch (error) {
    console.error('⚠️  Could not generate map overlay:', error.message);
    // Don't fail the whole script if overlay generation fails
  }
}

main();

