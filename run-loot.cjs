#!/usr/bin/env node

/**
 * Simple Loot Run Generator
 * Usage: node run-loot.js <map-name> <x> <y> [z]
 * Example: node run-loot.js dam 2000 3000 15
 */

const { createArcRaidersClient } = require('./dist/index.js');
const fs = require('fs');
const path = require('path');

// Use the script's directory (where run-loot.cjs is located)
// In CommonJS (.cjs files), __dirname is always available
const scriptDir = __dirname;

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
  // If a landmark is found (not a spawn), finds nearest spawn point to that landmark
  async function findLocationByName(mapName, locationName) {
    try {
      const client = createArcRaidersClient();
      const mapData = await client.getMapData(mapName);
      const searchLower = locationName.toLowerCase();
      
      // Search in waypoints first (preferred) - these are spawns/extractions
      const waypointMatch = (mapData.waypoints || []).find(wp => 
        wp.name && wp.name.toLowerCase().includes(searchLower) && wp.coordinates
      );
      if (waypointMatch) {
        // If it's a spawn point, return it directly
        if (waypointMatch.type === 'spawn') {
          return waypointMatch.coordinates;
        }
        // If it's an extraction or other waypoint, find nearest spawn
        if (waypointMatch.coordinates && spawnPoints.length > 0) {
          const nearestSpawn = findNearestSpawn(waypointMatch.coordinates, spawnPoints);
          if (nearestSpawn) {
            console.log(`📍 Found landmark "${locationName}" - using nearest spawn: ${nearestSpawn.name}`);
            return nearestSpawn.coordinates;
          }
        }
        return waypointMatch.coordinates;
      }
      
      // Search in POIs (landmarks, caches, etc.)
      const poiMatch = (mapData.pois || []).find(poi => 
        poi.name && poi.name.toLowerCase().includes(searchLower) && poi.coordinates
      );
      if (poiMatch) {
        // Found a landmark/POI - find nearest spawn point to it
        if (poiMatch.coordinates && spawnPoints.length > 0) {
          const nearestSpawn = findNearestSpawn(poiMatch.coordinates, spawnPoints);
          if (nearestSpawn) {
            console.log(`📍 Found landmark "${locationName}" - using nearest spawn: ${nearestSpawn.name}`);
            return nearestSpawn.coordinates;
          }
        }
        // Fallback to the landmark coordinates if no spawn found
        return poiMatch.coordinates;
      }
      
      return null;
    } catch (error) {
      console.error('Error searching for location:', error.message);
      return null;
    }
  }
  
  // Helper function to find nearest spawn point to given coordinates
  function findNearestSpawn(targetCoords, spawnPoints) {
    if (!targetCoords || spawnPoints.length === 0) return null;
    
    let nearest = null;
    let minDistance = Infinity;
    
    for (const spawn of spawnPoints) {
      if (!spawn.coordinates) continue;
      
      const dx = spawn.coordinates.x - targetCoords.x;
      const dy = spawn.coordinates.y - targetCoords.y;
      const dz = (spawn.coordinates.z || 0) - (targetCoords.z || 0);
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearest = spawn;
      }
    }
    
    return nearest;
  }

  // Fetch map data early to get spawn points for display and calibration
  // This will use cache if available, minimizing API calls
  let mapData = null;
  let spawnPoints = [];
  try {
    const client = createArcRaidersClient();
    // This will check cache first - if cached, no API call is made
    mapData = await client.getMapData(mapName);
    spawnPoints = (mapData.waypoints || []).filter(wp => wp.type === 'spawn' && wp.coordinates);
  } catch (error) {
    console.error('⚠️  Warning: Could not fetch map data for spawn points:', error.message);
    console.error('   This might be a network issue. Check your internet connection.');
  }

  // Helper function to display all locations on the map
  function displayAllLocations() {
    if (!mapData) {
      console.log('   Map data not available.');
      return;
    }
    
    console.log(`\n📍 All available locations on ${mapName}:`);
    console.log('─'.repeat(70));
    
    // Show spawn points
    if (spawnPoints.length > 0) {
      console.log('\n   🟢 SPAWN POINTS:');
      spawnPoints.forEach((spawn, i) => {
        const coords = spawn.coordinates;
        const name = spawn.name || 'player_spawn';
        const zStr = coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : '';
        console.log(`      ${(i + 1).toString().padStart(2)}. ${name.padEnd(30)} (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${zStr})`);
      });
    }
    
    // Show extraction points
    const extractionPoints = (mapData.waypoints || []).filter(wp => wp.type === 'extraction' && wp.coordinates);
    if (extractionPoints.length > 0) {
      console.log('\n   🔴 EXTRACTION POINTS:');
      extractionPoints.forEach((ext, i) => {
        const coords = ext.coordinates;
        const name = ext.name || 'extraction';
        const zStr = coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : '';
        console.log(`      ${(i + 1).toString().padStart(2)}. ${name.padEnd(30)} (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${zStr})`);
      });
    }
    
    // Show some cache locations (first 10 as examples)
    const cachePOIs = (mapData.pois || []).filter(poi => poi.type === 'cache' && poi.coordinates);
    if (cachePOIs.length > 0) {
      console.log('\n   💰 LOOT CACHES (showing first 10):');
      cachePOIs.slice(0, 10).forEach((cache, i) => {
        const coords = cache.coordinates;
        const name = cache.name || 'cache';
        const zStr = coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : '';
        console.log(`      ${(i + 1).toString().padStart(2)}. ${name.padEnd(30)} (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${zStr})`);
      });
      if (cachePOIs.length > 10) {
        console.log(`      ... and ${cachePOIs.length - 10} more cache locations`);
      }
    }
    
    console.log('─'.repeat(70));
    console.log('💡 You can use these coordinates or search by landmark name\n');
  }
  
  // Keep old function name for backward compatibility
  function displaySpawnPoints() {
    displayAllLocations();
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
          displayAllLocations();
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
          displayAllLocations();
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
        displayAllLocations();
        process.exit(1);
      }
    }
  } else {
    // No coordinates provided - show all locations and use first spawn
    console.log('\n📋 Showing all available locations for this map:\n');
    displayAllLocations();
    if (spawnPoints.length > 0) {
      const firstSpawn = spawnPoints[0];
      x = firstSpawn.coordinates.x;
      y = firstSpawn.coordinates.y;
      z = firstSpawn.coordinates.z;
      useCoordinates = true;
      console.log(`📍 Using first spawn point: ${firstSpawn.name || 'player_spawn'} at (${x.toFixed(1)}, ${y.toFixed(1)}${z !== undefined ? `, ${z.toFixed(1)}` : ''})`);
    } else {
      // Fallback to default spawn coordinates
      const defaultSpawn = DEFAULT_SPAWN[mapName] || DEFAULT_SPAWN.dam;
      x = defaultSpawn.x;
      y = defaultSpawn.y;
      useCoordinates = true;
      console.log(`📍 Using saved spawn coordinates: (${x}, ${y})`);
    }
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
    
    // Re-fetch map data if we don't have it yet (should already be fetched above)
    if (!mapData) {
      mapData = await client.getMapData(mapName);
      spawnPoints = (mapData.waypoints || []).filter(wp => wp.type === 'spawn' && wp.coordinates);
    }

    const options = {
      startAtSpawn: !useCoordinates, // Use spawn point if no coordinates
      startAtCoordinates: useCoordinates ? {
        x,
        y,
        ...(z !== undefined && { z }),
      } : undefined,
      endAtExtraction: true,
      maxCaches: 6, // 6 loot locations (spawn + 6 loot + exit = 8 total waypoints, extraction is 8th)
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
    
    // Automatically generate map overlay (pass spawn points for calibration)
    console.log('\n🔄 Generating map overlay...');
    generateMapOverlay(lootRun, mapName, spawnPoints);
    
  } catch (error) {
    console.error('\n❌ Error generating loot run:', error.message);
    if (error.message.includes('API')) {
      console.log('\n💡 Tip: The API might be temporarily unavailable. Try again in a moment.');
    }
    process.exit(1);
  }
}

function getMapImagePath(mapName) {
  // Check if map image file exists in script's directory
  const imagePath = path.join(scriptDir, `map-${mapName}.png`);
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

function generateMapOverlay(lootRun, mapName, spawnPoints = []) {
  try {
    // Map coordinate bounds and image dimensions
    const MAP_BOUNDS = {
      dam: {
        minX: 0,
        maxX: 6000,
        minY: 0,
        maxY: 4500,
        imageWidth: 1200,
        imageHeight: 900,
      },
      spaceport: {
        minX: 0,
        maxX: 6000,
        minY: 0,
        maxY: 4500,
        imageWidth: 1200,
        imageHeight: 900,
      },
      'buried-city': {
        minX: 0,
        maxX: 6000,
        minY: 0,
        maxY: 4500,
        imageWidth: 1200,
        imageHeight: 900,
      },
      'blue-gate': {
        minX: 0,
        maxX: 6000,
        minY: 0,
        maxY: 4500,
        imageWidth: 1200,
        imageHeight: 900,
      }
    };
    
    const bounds = MAP_BOUNDS[mapName] || MAP_BOUNDS.dam;
    
    // Multi-point calibration using spawn points
    // Use at least 2 spawn points for better accuracy
    let referencePoints = [];
    
    if (spawnPoints.length >= 2) {
      // Use up to 4 spawn points for calibration (more points = better accuracy)
      const pointsToUse = spawnPoints.slice(0, Math.min(4, spawnPoints.length));
      
      // Calculate pixel positions for spawn points based on their relative positions
      // This assumes spawn points are distributed across the map
      const allCoords = spawnPoints.map(sp => sp.coordinates);
      const minX = Math.min(...allCoords.map(c => c.x));
      const maxX = Math.max(...allCoords.map(c => c.x));
      const minY = Math.min(...allCoords.map(c => c.y));
      const maxY = Math.max(...allCoords.map(c => c.y));
      
      // Create reference points by mapping spawn coordinates to pixel positions
      referencePoints = pointsToUse.map(sp => {
        const coord = sp.coordinates;
        // Normalize coordinates to 0-1 range
        const normX = (coord.x - minX) / (maxX - minX || 1);
        const normY = (coord.y - minY) / (maxY - minY || 1);
        
        // Map to pixel positions (with some margin)
        const margin = 0.1; // 10% margin on all sides
        const pixelX = margin * bounds.imageWidth + normX * (1 - 2 * margin) * bounds.imageWidth;
        const pixelY = margin * bounds.imageHeight + normY * (1 - 2 * margin) * bounds.imageHeight;
        
        return {
          coord: { x: coord.x, y: coord.y },
          pixel: { x: pixelX, y: pixelY }
        };
      });
    } else if (spawnPoints.length === 1) {
      // Single spawn point - use center of map as second reference
      const sp = spawnPoints[0];
      const centerCoord = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
      referencePoints = [
        {
          coord: { x: sp.coordinates.x, y: sp.coordinates.y },
          pixel: { x: bounds.imageWidth * 0.5, y: bounds.imageHeight * 0.5 }
        },
        {
          coord: centerCoord,
          pixel: { x: bounds.imageWidth * 0.5, y: bounds.imageHeight * 0.5 }
        }
      ];
    }
    
    // Calculate coordinate to pixel transformation using multiple reference points
    const coordToPixel = (coord) => {
      if (referencePoints.length >= 2) {
        // Use affine transformation with multiple reference points
        // Calculate weighted average based on distance to reference points
        let totalWeight = 0;
        let weightedX = 0;
        let weightedY = 0;
        
        for (const ref of referencePoints) {
          const dx = coord.x - ref.coord.x;
          const dy = coord.y - ref.coord.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          // Use inverse distance weighting (closer points have more influence)
          const weight = distance > 0 ? 1 / (distance + 1) : 1000;
          
          // Calculate pixel offset from this reference point
          const scaleX = bounds.imageWidth / (bounds.maxX - bounds.minX || 1);
          const scaleY = bounds.imageHeight / (bounds.maxY - bounds.minY || 1);
          const offsetX = dx * scaleX;
          const offsetY = dy * scaleY;
          
          const pixelX = ref.pixel.x + offsetX;
          const pixelY = ref.pixel.y - offsetY; // Flip Y axis
          
          weightedX += pixelX * weight;
          weightedY += pixelY * weight;
          totalWeight += weight;
        }
        
        return {
          x: weightedX / totalWeight,
          y: weightedY / totalWeight
        };
      } else {
        // Fallback to simple normalization
        let normalizedX = (coord.x - bounds.minX) / (bounds.maxX - bounds.minX || 1);
        let normalizedY = (coord.y - bounds.minY) / (bounds.maxY - bounds.minY || 1);
        
        normalizedX = Math.max(0, Math.min(1, normalizedX));
        normalizedY = Math.max(0, Math.min(1, normalizedY));
        
        return {
          x: normalizedX * bounds.imageWidth,
          y: (1 - normalizedY) * bounds.imageHeight // Flip Y axis
        };
      }
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
                ${referencePoints.length > 0 ? ` | Calibrated using ${referencePoints.length} spawn point${referencePoints.length > 1 ? 's' : ''}` : ''}
            </p>
            <p style="margin-top: 5px; font-size: 11px; color: #666;">
                ${referencePoints.length >= 2 ? '✅ Using multi-point calibration for better accuracy' : referencePoints.length === 1 ? '⚠️ Using single-point calibration - accuracy may vary' : '⚠️ Using estimated bounds - spawn points not available'}
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
    // Save HTML file in the script's directory
    const filepath = path.join(scriptDir, filename);
    fs.writeFileSync(filepath, html);

    console.log(`✅ Map overlay saved: ${filename}`);
    console.log(`💡 Open ${filename} in your browser to view the visual map!`);
  } catch (error) {
    console.error('⚠️  Could not generate map overlay:', error.message);
    // Don't fail the whole script if overlay generation fails
  }
}

main();

