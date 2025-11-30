#!/usr/bin/env node

/**
 * Simple Loot Run Generator
 * Usage: node run-loot.js <map-name> <x> <y> [z]
 * Example: node run-loot.js dam 2000 3000 15
 */

const { createArcRaidersClient } = require('./dist/index.js');
const fs = require('fs');
const path = require('path');
const { imageSize } = require('image-size');

const GRID_COLUMNS = 6;
const GRID_ROWS = 6;
const GRID_COLUMN_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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
      maxCaches: 8, // Spawn + 8 loot locations + extraction = 10 total waypoints (extraction is always #10)
      avoidDangerousAreas: true,
      algorithm: 'extraction-aware',
      maxTimeBeforeExtraction: 300, // 5 minutes
      avoidPlayerInterception: true, // Avoid paths that other players can intercept
      playerMovementSpeed: 5, // Units per second
      roundDuration: 1800, // 30 minutes total round
      lateSpawnWindow: { min: 960, max: 1200 }, // 16-20 minutes late spawn window
      spawnAvoidanceRadius: 250,
      dangerCorridorRadius: 120,
      clusterRadius: 150,
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
    generateMapOverlay(lootRun, mapName, spawnPoints, mapData);
    
  } catch (error) {
    console.error('\n❌ Error generating loot run:', error.message);
    if (error.message.includes('API')) {
      console.log('\n💡 Tip: The API might be temporarily unavailable. Try again in a moment.');
    }
    process.exit(1);
  }
}

function getMapImageInfo(mapName) {
  const imageFilename = `map-${mapName}.png`;
  const imagePath = path.join(scriptDir, imageFilename);
  const fallbackWidth = 1200;
  const fallbackHeight = 900;

  if (fs.existsSync(imagePath)) {
    try {
      // Read file as buffer for image-size library
      const fileBuffer = fs.readFileSync(imagePath);
      const { width, height } = imageSize(fileBuffer);
      if (width && height) {
        return {
          src: imageFilename,
          width,
          height,
          exists: true,
          path: imagePath,
        };
      }
    } catch (error) {
      console.warn(`⚠️  Could not determine size of ${imageFilename}:`, error.message);
    }
    return {
      src: imageFilename,
      width: fallbackWidth,
      height: fallbackHeight,
      exists: true,
      path: imagePath,
    };
  }

  const placeholder = `<svg width="${fallbackWidth}" height="${fallbackHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#2a2a2a"/>
    <text x="50%" y="45%" text-anchor="middle" fill="#888" font-size="20">Map Image Not Found</text>
    <text x="50%" y="50%" text-anchor="middle" fill="#666" font-size="14">Save map image as: ${imageFilename}</text>
    <text x="50%" y="55%" text-anchor="middle" fill="#666" font-size="12">Path overlay will still work with coordinate system</text>
  </svg>`;

  return {
    src: `data:image/svg+xml;base64,${Buffer.from(placeholder).toString('base64')}`,
    width: fallbackWidth,
    height: fallbackHeight,
    exists: false,
  };
}

function generateMapOverlay(lootRun, mapName, spawnPoints = [], mapData = null) {
  try {
    const FALLBACK_BOUNDS = {
      dam: { minX: 0, maxX: 6000, minY: 0, maxY: 4500 },
      spaceport: { minX: 0, maxX: 6000, minY: 0, maxY: 4500 },
      'buried-city': { minX: 0, maxX: 6000, minY: 0, maxY: 4500 },
      'blue-gate': { minX: 0, maxX: 6000, minY: 0, maxY: 4500 },
    };

    const mapImageInfo = getMapImageInfo(mapName);

    const derivedCoordinates = [];
    if (lootRun?.waypoints?.length) {
      lootRun.waypoints.forEach(wp => {
        if (wp.coordinates) derivedCoordinates.push(wp.coordinates);
      });
    }
    if (mapData?.waypoints?.length) {
      mapData.waypoints.forEach(wp => {
        if (wp.coordinates) derivedCoordinates.push(wp.coordinates);
      });
    }
    if (mapData?.pois?.length) {
      mapData.pois.forEach(poi => {
        if (poi.coordinates) derivedCoordinates.push(poi.coordinates);
      });
    }

    let bounds;
    if (derivedCoordinates.length >= 2) {
      const xs = derivedCoordinates.map(c => c.x);
      const ys = derivedCoordinates.map(c => c.y);
      bounds = {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
        imageWidth: mapImageInfo.width,
        imageHeight: mapImageInfo.height,
        dynamic: true,
      };
    } else {
      const fallback = FALLBACK_BOUNDS[mapName] || FALLBACK_BOUNDS.dam;
      bounds = {
        ...fallback,
        imageWidth: mapImageInfo.width,
        imageHeight: mapImageInfo.height,
        dynamic: false,
      };
    }

    const coordToGridCell = (coord) => {
      const spanX = bounds.maxX - bounds.minX || 1;
      const spanY = bounds.maxY - bounds.minY || 1;
      const normX = Math.min(0.9999, Math.max(0, (coord.x - bounds.minX) / spanX));
      const normY = Math.min(0.9999, Math.max(0, (coord.y - bounds.minY) / spanY));
      const colIndex = Math.floor(normX * GRID_COLUMNS);
      const rowIndex = Math.floor(normY * GRID_ROWS);
      const columnLabel = GRID_COLUMN_LABELS[colIndex] || `C${colIndex + 1}`;
      const rowLabel = (rowIndex + 1).toString();
      return `${columnLabel}${rowLabel}`;
    };
    
    // Multi-point calibration using spawn points and user's actual infill location
    // Use at least 2 spawn points for better accuracy
    let referencePoints = [];
    
    // If we have the user's actual infill coordinates, use them as a primary reference
    const infillWaypoint = lootRun.waypoints[0];
    const userInfillCoords = infillWaypoint && infillWaypoint.coordinates ? infillWaypoint.coordinates : null;
    
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
      
      // If user provided custom infill coordinates, add them as a high-priority reference
      // This ensures the infill point is accurately positioned
      if (userInfillCoords) {
        const infillNormX = (userInfillCoords.x - minX) / (maxX - minX || 1);
        const infillNormY = (userInfillCoords.y - minY) / (maxY - minY || 1);
        const margin = 0.1;
        const infillPixelX = margin * bounds.imageWidth + infillNormX * (1 - 2 * margin) * bounds.imageWidth;
        const infillPixelY = margin * bounds.imageHeight + infillNormY * (1 - 2 * margin) * bounds.imageHeight;
        
        // Add infill as first reference point (highest priority)
        referencePoints.unshift({
          coord: { x: userInfillCoords.x, y: userInfillCoords.y },
          pixel: { x: infillPixelX, y: infillPixelY }
        });
      }
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
      
      // Add user infill if available
      if (userInfillCoords) {
        const infillNormX = (userInfillCoords.x - bounds.minX) / (bounds.maxX - bounds.minX || 1);
        const infillNormY = (userInfillCoords.y - bounds.minY) / (bounds.maxY - bounds.minY || 1);
        referencePoints.unshift({
          coord: { x: userInfillCoords.x, y: userInfillCoords.y },
          pixel: { 
            x: infillNormX * bounds.imageWidth, 
            y: (1 - infillNormY) * bounds.imageHeight 
          }
        });
      }
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
    
    const columnLabels = Array.from({ length: GRID_COLUMNS }, (_, i) => GRID_COLUMN_LABELS[i] || `C${i + 1}`);
    const rowLabels = Array.from({ length: GRID_ROWS }, (_, i) => (i + 1).toString());

    const verticalGridLines = [];
    for (let i = 1; i < GRID_COLUMNS; i++) {
      const ratio = i / GRID_COLUMNS;
      const pixelX = ratio * mapImageInfo.width;
      verticalGridLines.push({ x1: pixelX, y1: 0, x2: pixelX, y2: mapImageInfo.height });
    }

    const horizontalGridLines = [];
    for (let i = 1; i < GRID_ROWS; i++) {
      const ratio = i / GRID_ROWS;
      const pixelY = ratio * mapImageInfo.height;
      horizontalGridLines.push({ x1: 0, y1: pixelY, x2: mapImageInfo.width, y2: pixelY });
    }

    const columnLabelPositions = columnLabels.map((label, idx) => ({
      label,
      x: (idx + 0.5) * (mapImageInfo.width / GRID_COLUMNS),
    }));
    const rowLabelPositions = rowLabels.map((label, idx) => ({
      label,
      y: (idx + 0.5) * (mapImageInfo.height / GRID_ROWS),
    }));

    // Generate a smooth Catmull-Rom style curve through waypoints
    function generateCurvedPath(waypoints, coordToPixelFn) {
      if (waypoints.length < 2) return '';

      const pixelPoints = waypoints.map(wp => coordToPixelFn(wp.coordinates));
      let pathData = `M ${pixelPoints[0].x} ${pixelPoints[0].y}`;

      for (let i = 0; i < pixelPoints.length - 1; i++) {
        const p0 = pixelPoints[i - 1] || pixelPoints[i];
        const p1 = pixelPoints[i];
        const p2 = pixelPoints[i + 1];
        const p3 = pixelPoints[i + 2] || p2;

        // Catmull-Rom to cubic Bezier conversion for smooth transitions
        const tension = 0.5;
        const cp1x = p1.x + (p2.x - p0.x) * tension / 6;
        const cp1y = p1.y + (p2.y - p0.y) * tension / 6;
        const cp2x = p2.x - (p3.x - p1.x) * tension / 6;
        const cp2y = p2.y - (p3.y - p1.y) * tension / 6;

        pathData += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
      }

      return pathData;
    }

    // Generate the curved path data before the template string
    const curvedPathData = generateCurvedPath(lootRun.waypoints, coordToPixel);

    // Precompute pixel positions for all waypoints
    const pixelWaypoints = lootRun.waypoints.map((wp, index) => ({
      index,
      waypoint: wp,
      pixel: coordToPixel(wp.coordinates),
    }));

    // Detect tight clusters (nearby caches/ARCs) to highlight as general areas
    const clusterAssignments = new Map();
    const clusterBoxes = [];
    const clusterDistancePx = 45;
    const clusterPaddingPx = 14;

    for (let i = 0; i < pixelWaypoints.length; i++) {
      if (clusterAssignments.has(i)) continue;
      const current = pixelWaypoints[i];
      if (!current || !current.waypoint) continue;
      if (!['cache', 'arc'].includes(current.waypoint.type || '')) continue;

      const members = [current];

      for (let j = i + 1; j < pixelWaypoints.length; j++) {
        if (clusterAssignments.has(j)) continue;
        const candidate = pixelWaypoints[j];
        if (!candidate || !candidate.waypoint) continue;
        if (!['cache', 'arc'].includes(candidate.waypoint.type || '')) continue;

        const dx = current.pixel.x - candidate.pixel.x;
        const dy = current.pixel.y - candidate.pixel.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= clusterDistancePx) {
          members.push(candidate);
        }
      }

      if (members.length >= 2) {
        const indices = members.map(member => member.index);
        members.forEach(member => clusterAssignments.set(member.index, clusterBoxes.length));

        const xs = members.map(member => member.pixel.x);
        const ys = members.map(member => member.pixel.y);
        const minX = Math.min(...xs) - clusterPaddingPx;
        const maxX = Math.max(...xs) + clusterPaddingPx;
        const minY = Math.min(...ys) - clusterPaddingPx;
        const maxY = Math.max(...ys) + clusterPaddingPx;

        const stepNumbers = indices
          .map(idx => idx + 1)
          .sort((a, b) => a - b);
        const stepLabel = stepNumbers.length === 2
          ? `${stepNumbers[0]} & ${stepNumbers[1]}`
          : `${stepNumbers[0]}–${stepNumbers[stepNumbers.length - 1]}`;

        clusterBoxes.push({
          id: clusterBoxes.length,
          indices,
          minX,
          minY,
          width: maxX - minX,
          height: maxY - minY,
          centerX: (minX + maxX) / 2,
          centerY: (minY + maxY) / 2,
          label: `General Area: Steps ${stepLabel}`,
          count: members.length,
        });
      }
    }

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
        .map-grid line {
            stroke: rgba(255, 255, 255, 0.15);
            stroke-width: 1;
        }
        .grid-label {
            fill: rgba(255, 255, 255, 0.6);
            font-size: 11px;
            font-weight: bold;
            text-anchor: middle;
            pointer-events: none;
            text-shadow: 0 0 3px #000000;
        }
        .waypoint-line {
            stroke: #4a9eff;
            stroke-width: 3;
            fill: none;
            opacity: 0.7;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .waypoint {
            cursor: pointer;
        }
        .waypoint-spawn {
            fill: #00ff00;
            stroke: #ffffff;
            stroke-width: 2;
        }
        .waypoint-infill {
            fill: #00ffcc;
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
        .cluster-box rect {
            fill: rgba(255, 170, 0, 0.12);
            stroke: #ffaa00;
            stroke-width: 2;
            stroke-dasharray: 6 4;
        }
        .cluster-box text {
            fill: #ffaa00;
            font-size: 12px;
            font-weight: bold;
            text-anchor: middle;
            pointer-events: none;
            text-shadow: 0 0 4px #000000;
        }
        .cluster-centroid {
            fill: #ffaa00;
            stroke: #ffffff;
            stroke-width: 2;
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
        .legend-color.cluster {
            border-radius: 4px;
            border: 2px dashed #ffaa00;
            background: rgba(255, 170, 0, 0.15);
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
        .cluster-summary {
            background: #2a2a2a;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
        }
        .cluster-summary h3 {
            margin-top: 0;
            color: #ffaa00;
        }
        .cluster-summary ul {
            margin: 0;
            padding-left: 20px;
        }
        .cluster-summary li {
            margin: 4px 0;
            color: #e0e0e0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🗺️ Loot Run: ${lootRun.mapName.toUpperCase()}</h1>
        
        <div class="stats">
            <p><strong>Total Distance:</strong> ${lootRun.totalDistance.toFixed(2)} units</p>
            <p><strong>Estimated Time:</strong> ${lootRun.estimatedTime ? Math.round(lootRun.estimatedTime / 60) + 'm ' + Math.round(lootRun.estimatedTime % 60) + 's' : 'N/A'}</p>
            <p><strong>Waypoints:</strong> ${lootRun.waypoints.length - clusterBoxes.reduce((sum, box) => sum + (box.count - 1), 0)} (${lootRun.waypoints.length} locations, ${clusterBoxes.length} clustered)</p>
        </div>

        <div class="map-container">
            <h2>Path Visualization</h2>
            <div class="map-overlay-wrapper" style="max-width: ${mapImageInfo.width}px; margin: 0 auto;">
                <!-- Map image as background -->
                <img id="mapImage" src="${mapImageInfo.src}" 
                     alt="Map" 
                     style="width: 100%; height: auto; display: block; border: 2px solid #3a3a3a; border-radius: 4px;"
                     onload="calibrateOverlay(); console.log('Map image loaded:', this.naturalWidth, 'x', this.naturalHeight);"
                     onerror="console.error('Failed to load map image. Make sure map-dam.png is in the same folder as this HTML file. Path:', this.src)" />
                
                <!-- Overlay SVG for path -->
                <svg class="path-overlay"
                     viewBox="0 0 ${mapImageInfo.width} ${mapImageInfo.height}" 
                     preserveAspectRatio="xMidYMid meet"
                     xmlns="http://www.w3.org/2000/svg">
                    <g class="map-grid">
                      ${verticalGridLines.map(line => `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" />`).join('\n                      ')}
                      ${horizontalGridLines.map(line => `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" />`).join('\n                      ')}
                      ${columnLabelPositions.map(col => `<text class="grid-label" x="${col.x}" y="14">${col.label}</text>`).join('\n                      ')}
                      ${columnLabelPositions.map(col => `<text class="grid-label" x="${col.x}" y="${mapImageInfo.height - 4}">${col.label}</text>`).join('\n                      ')}
                      ${rowLabelPositions.map(row => `<text class="grid-label" x="12" y="${row.y + 4}">${row.label}</text>`).join('\n                      ')}
                      ${rowLabelPositions.map(row => `<text class="grid-label" x="${mapImageInfo.width - 10}" y="${row.y + 4}">${row.label}</text>`).join('\n                      ')}
                    </g>
                    <!-- Arrow marker definitions -->
                    <defs>
                      <marker id="arrowhead-red" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill="#ff0000" />
                      </marker>
                      <marker id="arrowhead-red-light" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill="#ff6666" />
                      </marker>
                    </defs>
                    
                    <!-- Draw curved path -->
                    <path class="waypoint-line" d="${curvedPathData}" />
                    
                    <!-- Draw cluster boxes -->
                    ${clusterBoxes.map(box => `
                      <g class="cluster-box" data-count="${box.count}">
                        <rect x="${box.minX}" y="${box.minY}" width="${box.width}" height="${box.height}" rx="6" ry="6" />
                        <text x="${box.centerX}" y="${box.minY - 6}">${box.label}</text>
                        <circle class="cluster-centroid" cx="${box.centerX}" cy="${box.centerY}" r="7" />
                      </g>
                    `).join('\n                    ')}

                    <!-- Draw waypoints (skip ones grouped into clusters) -->
                    ${pixelWaypoints.map(({ waypoint: wp, index: i, pixel: px }) => {
                      if (!wp) return '';
                      if (clusterAssignments.has(i)) return '';
                      const type = wp.type || 'cache';
                      const isInfill = i === 0;
                      const isExfil = i === lootRun.waypoints.length - 1;
                      const colorClass = isInfill ? 'waypoint-infill' : `waypoint-${type}`;
                      const labelText = isInfill ? 'INF' : (isExfil ? 'EXF' : i + 1);
                      return `
                        <circle class="waypoint ${colorClass}" cx="${px.x}" cy="${px.y}" r="10" data-step="${i + 1}" data-name="${wp.name}" data-coords="(${wp.coordinates.x.toFixed(1)}, ${wp.coordinates.y.toFixed(1)}${wp.coordinates.z !== undefined ? `, ${wp.coordinates.z.toFixed(1)}` : ''})" />
                        <text class="waypoint-label" x="${px.x}" y="${px.y - 18}" fill="#ffffff" stroke="#000000" stroke-width="0.5">${labelText}</text>`;
                    }).join('\n                    ')}
                    
                    <!-- Early spawn interception arrows -->
                    ${(() => {
                      const firstWaypoint = lootRun.waypoints[0];
                      if (!firstWaypoint?.playerInterceptionRisk) return '';
                      
                      const risk = firstWaypoint.playerInterceptionRisk;
                      let arrowsHtml = '';
                      
                      // Get user's spawn coordinates to exclude it
                      const userSpawnCoords = firstWaypoint.coordinates;
                      
                      // Early spawn arrows (from waypointSpawnAnalysis)
                      if (risk.waypointSpawnAnalysis && risk.waypointSpawnAnalysis.length > 0) {
                        for (const analysis of risk.waypointSpawnAnalysis) {
                          // Skip if this is the user's spawn point
                          const spawnCoords = analysis.closestSpawn.coordinates;
                          const distToUserSpawn = Math.sqrt(
                            Math.pow(spawnCoords.x - userSpawnCoords.x, 2) + 
                            Math.pow(spawnCoords.y - userSpawnCoords.y, 2)
                          );
                          if (distToUserSpawn < 10) continue; // Skip user's own spawn
                          
                          const waypointPixel = coordToPixel(lootRun.waypoints[analysis.waypointIndex].coordinates);
                          const spawnPixel = coordToPixel(spawnCoords);
                          
                          // Calculate arrow direction
                          const dx = waypointPixel.x - spawnPixel.x;
                          const dy = waypointPixel.y - spawnPixel.y;
                          const angle = Math.atan2(dy, dx);
                          
                          // Offset arrow start/end to avoid overlapping with waypoint circles
                          const waypointRadius = 10;
                          const spawnRadius = 8;
                          const offsetStart = spawnRadius + 5;
                          const offsetEnd = waypointRadius + 5;
                          
                          const startX = spawnPixel.x + Math.cos(angle) * offsetStart;
                          const startY = spawnPixel.y + Math.sin(angle) * offsetStart;
                          const endX = waypointPixel.x - Math.cos(angle) * offsetEnd;
                          const endY = waypointPixel.y - Math.sin(angle) * offsetEnd;
                          
                          // Calculate midpoint for time label
                          const midX = (startX + endX) / 2;
                          const midY = (startY + endY) / 2;
                          
                          // Format time
                          const theirMin = Math.floor(analysis.closestSpawn.theirArrivalTime / 60);
                          const theirSec = Math.round(analysis.closestSpawn.theirArrivalTime % 60);
                          const timeText = `${theirMin}m ${theirSec}s`;
                          
                          // Color based on interception risk
                          const arrowColor = analysis.closestSpawn.canBeatYou ? '#ff0000' : '#ff6666';
                          const strokeWidth = analysis.closestSpawn.canBeatYou ? 2.5 : 2;
                          const markerId = analysis.closestSpawn.canBeatYou ? 'arrowhead-red' : 'arrowhead-red-light';
                          
                          arrowsHtml += `
                            <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" 
                                  stroke="${arrowColor}" 
                                  stroke-width="${strokeWidth}" 
                                  stroke-opacity="0.7"
                                  marker-end="url(#${markerId})" />
                            <circle cx="${spawnPixel.x}" cy="${spawnPixel.y}" r="6" fill="${arrowColor}" stroke="#ffffff" stroke-width="1.5" opacity="0.8" />
                            <text x="${midX}" y="${midY - 8}" 
                                  fill="${arrowColor}" 
                                  font-size="11" 
                                  font-weight="bold"
                                  text-anchor="middle"
                                  stroke="#000000" 
                                  stroke-width="0.3"
                                  style="pointer-events: none;">${timeText}</text>
                            <text x="${spawnPixel.x}" y="${spawnPixel.y - 12}" 
                                  fill="${arrowColor}" 
                                  font-size="9" 
                                  text-anchor="middle"
                                  stroke="#000000" 
                                  stroke-width="0.3"
                                  style="pointer-events: none;">${analysis.closestSpawn.spawnName || 'Spawn'}</text>`;
                        }
                      }
                      
                      return arrowsHtml;
                    })()}
                </svg>
            </div>
            <p style="margin-top: 10px; font-size: 12px; color: #888;">
                💡 Reference: Map bounds (${bounds.minX.toFixed(0)}, ${bounds.minY.toFixed(0)}) to (${bounds.maxX.toFixed(0)}, ${bounds.maxY.toFixed(0)}) · Image ${mapImageInfo.width}×${mapImageInfo.height}px
                ${bounds.dynamic ? ' · Derived from live map data' : ' · Using fallback range'}
            </p>
            <p style="margin-top: 5px; font-size: 11px; color: #666;">
                ${referencePoints.length >= 2
                  ? `✅ Using ${referencePoints.length} spawn-based calibration point${referencePoints.length > 1 ? 's' : ''}`
                  : referencePoints.length === 1
                    ? '⚠️ Only one spawn reference available — overlay accuracy may vary'
                    : '⚠️ No spawn references available — falling back to normalized bounds'}
                ${mapImageInfo.exists ? '' : ' · ⚠️ Placeholder image in use'}
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
            <div class="legend-item">
                <div class="legend-color cluster"></div>
                <span>General loot cluster (look in boxed area)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #ff0000; border-color: #ff0000;"></div>
                <span>Early spawn interception (bright red = can intercept, light red = safe) - shows arrival time</span>
            </div>
        </div>

        <div class="schedule-section" style="background: #2a2a2a; padding: 15px; border-radius: 8px; margin-top: 20px;">
            <h3>⏱️ Timing Schedule</h3>
            <p style="color: #b0b0b0; font-size: 14px; margin-bottom: 15px;">
                Shows when to arrive, wait times, when other players could reach each location, and how long you have at each location before another team could arrive (Safe Window)
            </p>
            <table style="width: 100%; border-collapse: collapse; color: #e0e0e0;">
                <thead>
                    <tr style="background: #1e1e1e; border-bottom: 2px solid #4a9eff;">
                        <th style="padding: 10px; text-align: left; border-right: 1px solid #3a3a3a;">Step</th>
                        <th style="padding: 10px; text-align: left; border-right: 1px solid #3a3a3a;">Location</th>
                        <th style="padding: 10px; text-align: left; border-right: 1px solid #3a3a3a;">Your Arrival</th>
                        <th style="padding: 10px; text-align: left; border-right: 1px solid #3a3a3a;">Fastest Player Arrival</th>
                        <th style="padding: 10px; text-align: left; border-right: 1px solid #3a3a3a;">Wait Time</th>
                        <th style="padding: 10px; text-align: left; border-right: 1px solid #3a3a3a;">Safe Window</th>
                        <th style="padding: 10px; text-align: left;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${lootRun.waypoints.map((wp, i) => {
                      const arrivalTime = wp.arrivalTime || 0;
                      const arrivalMin = Math.floor(arrivalTime / 60);
                      const arrivalSec = Math.round(arrivalTime % 60);
                      const arrivalStr = arrivalTime > 0 ? `${arrivalMin}m ${arrivalSec}s` : '-';
                      
                      const fastestArrival = wp.fastestPlayerArrivalTime;
                      const fastestMin = fastestArrival ? Math.floor(fastestArrival / 60) : null;
                      const fastestSec = fastestArrival ? Math.round(fastestArrival % 60) : null;
                      const fastestStr = fastestArrival ? `${fastestMin}m ${fastestSec}s (${wp.fastestPlayerSpawnName || 'Player'})` : '-';
                      
                      const waitTime = wp.waitTime || 0;
                      const waitMin = waitTime > 0 ? Math.floor(waitTime / 60) : 0;
                      const waitSec = waitTime > 0 ? Math.round(waitTime % 60) : 0;
                      const waitStr = waitTime > 0 ? `${waitMin}m ${waitSec}s` : '-';
                      
                      // Calculate safe window: time from arrival (after wait) until next player could arrive
                      const safeWindow = wp.safeWindow;
                      let safeWindowStr = '-';
                      let safeWindowColor = '#e0e0e0';
                      if (safeWindow !== undefined && safeWindow < Infinity) {
                        const safeMin = Math.floor(safeWindow / 60);
                        const safeSec = Math.round(safeWindow % 60);
                        safeWindowStr = `${safeMin}m ${safeSec}s`;
                        // Color code: green if > 60s, yellow if 30-60s, red if < 30s
                        if (safeWindow > 60) {
                          safeWindowColor = '#00ff00';
                        } else if (safeWindow > 30) {
                          safeWindowColor = '#ffaa00';
                        } else {
                          safeWindowColor = '#ff6666';
                        }
                      }
                      
                      let status = '✅ Safe';
                      let statusColor = '#00ff00';
                      if (fastestArrival && fastestArrival < arrivalTime) {
                        if (waitTime > 0) {
                          status = '⏱️ Wait Required';
                          statusColor = '#ffaa00';
                        } else {
                          status = '⚠️ Possible Conflict';
                          statusColor = '#ff6666';
                        }
                      }
                      
                      // Skip spawn waypoint in schedule (it's at 0:00)
                      if (wp.type === 'spawn') {
                        return `
                    <tr style="border-bottom: 1px solid #3a3a3a;">
                        <td style="padding: 8px; border-right: 1px solid #3a3a3a;">${i + 1}</td>
                        <td style="padding: 8px; border-right: 1px solid #3a3a3a;"><strong>${wp.name}</strong></td>
                        <td style="padding: 8px; border-right: 1px solid #3a3a3a;">0m 0s</td>
                        <td style="padding: 8px; border-right: 1px solid #3a3a3a;">-</td>
                        <td style="padding: 8px; border-right: 1px solid #3a3a3a;">-</td>
                        <td style="padding: 8px; border-right: 1px solid #3a3a3a;">-</td>
                        <td style="padding: 8px; color: #00ff00;">✅ Start</td>
                    </tr>`;
                      }
                      
                      return `
                    <tr style="border-bottom: 1px solid #3a3a3a; ${waitTime > 0 ? 'background: rgba(255, 170, 0, 0.1);' : ''}">
                        <td style="padding: 8px; border-right: 1px solid #3a3a3a;">${i + 1}</td>
                        <td style="padding: 8px; border-right: 1px solid #3a3a3a;"><strong>${wp.name}</strong></td>
                        <td style="padding: 8px; border-right: 1px solid #3a3a3a;">${arrivalStr}</td>
                        <td style="padding: 8px; border-right: 1px solid #3a3a3a; ${fastestArrival && fastestArrival < arrivalTime ? 'color: #ff6666;' : ''}">${fastestStr}</td>
                        <td style="padding: 8px; border-right: 1px solid #3a3a3a; ${waitTime > 0 ? 'color: #ffaa00; font-weight: bold;' : ''}">${waitStr}</td>
                        <td style="padding: 8px; border-right: 1px solid #3a3a3a; color: ${safeWindowColor}; font-weight: ${safeWindow !== undefined && safeWindow < Infinity ? 'bold' : 'normal'};" title="Time you have at this location before another player could arrive">${safeWindowStr}</td>
                        <td style="padding: 8px; color: ${statusColor};">${status}</td>
                    </tr>`;
                    }).join('\n')}
                </tbody>
            </table>
            ${lootRun.waypoints.some(wp => wp.waitTime && wp.waitTime > 0) ? `
            <div style="margin-top: 15px; padding: 10px; background: rgba(255, 170, 0, 0.15); border-left: 4px solid #ffaa00; border-radius: 4px;">
                <p style="margin: 0; color: #ffaa00;"><strong>⏱️ Wait Times:</strong> Wait at the location until the specified time has passed to avoid other players.</p>
            </div>` : ''}
        </div>

        <div class="waypoints-list">
            <h3>Step-by-Step Instructions</h3>
            ${lootRun.waypoints.map((wp, i) => {
              // Check if this waypoint is part of a cluster
              const clusterIndex = clusterAssignments.get(i);
              const isInCluster = clusterIndex !== undefined;
              
              // If in cluster, only show once (as the first member)
              if (isInCluster) {
                const clusterBox = clusterBoxes[clusterIndex];
                const isFirstInCluster = clusterBox.indices[0] === i;
                if (!isFirstInCluster) {
                  // Skip other members of cluster - they're shown in the cluster summary
                  return '';
                }
                
                // Show cluster as single waypoint with all loot listed
                const clusterMembers = clusterBox.indices.map(idx => lootRun.waypoints[idx]);
                const clusterLootNames = clusterMembers
                  .filter(m => m && ['cache', 'arc'].includes(m.type || ''))
                  .map(m => m.name)
                  .filter(Boolean);
                
                const icon = '📦';
                const coords = wp.coordinates;
                const gridCell = coordToGridCell(coords);
                return `
            <div class="waypoint-item">
                <h4>${icon} Step ${i + 1}: General Loot Area (${clusterBox.count} locations)</h4>
                <p><strong>Location:</strong> ${wp.name} (and ${clusterBox.count - 1} nearby)</p>
                <p><strong>Coordinates:</strong> (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : ''})</p>
                <p><strong>Grid:</strong> ${gridCell}</p>
                <p><strong>Look for these loot locations in this area:</strong></p>
                <ul style="margin: 5px 0; padding-left: 20px;">
                    ${clusterLootNames.map(name => `<li>${name}</li>`).join('\n                    ')}
                </ul>
                ${wp.distanceToExtraction !== undefined ? `<p><strong>Distance to extraction:</strong> ${wp.distanceToExtraction.toFixed(1)} units</p>` : ''}
                ${wp.dangerLevel && wp.dangerLevel !== 'low' ? `<p><strong>⚠️ Danger:</strong> ${wp.dangerLevel.toUpperCase()}</p>` : ''}
            </div>`;
              }
              
              // Regular waypoint (not in cluster)
              const icon = wp.type === 'spawn' ? '🚀' : wp.type === 'extraction' ? '✈️' : wp.type === 'raider-key' ? '🔑' : '📦';
              const coords = wp.coordinates;
              const gridCell = coordToGridCell(coords);
              return `
            <div class="waypoint-item">
                <h4>${icon} Step ${i + 1}: ${wp.instruction || wp.name}</h4>
                <p><strong>Location:</strong> ${wp.name}</p>
                <p><strong>Coordinates:</strong> (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : ''})</p>
                <p><strong>Grid:</strong> ${gridCell}</p>
                ${wp.distanceToExtraction !== undefined ? `<p><strong>Distance to extraction:</strong> ${wp.distanceToExtraction.toFixed(1)} units</p>` : ''}
                ${wp.dangerLevel && wp.dangerLevel !== 'low' ? `<p><strong>⚠️ Danger:</strong> ${wp.dangerLevel.toUpperCase()}</p>` : ''}
            </div>`;
            }).filter(html => html.trim()).join('\n            ')}
        </div>

        ${clusterBoxes.length > 0 ? `
        <div class="cluster-summary">
            <h3>📦 General Loot Areas (Count as 1 waypoint each)</h3>
            <p style="color: #888; font-size: 13px; margin-bottom: 10px;">These areas contain multiple loot locations grouped together for efficiency.</p>
            <ul>
                ${clusterBoxes.map(box => {
                  const clusterMembers = box.indices.map(idx => lootRun.waypoints[idx]);
                  const lootNames = clusterMembers
                    .filter(m => m && ['cache', 'arc'].includes(m.type || ''))
                    .map(m => m.name)
                    .filter(Boolean);
                  return `<li><strong>${box.label}</strong> · Look for: ${lootNames.join(', ')}</li>`;
                }).join('\n                ')}
            </ul>
        </div>` : ''}
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

