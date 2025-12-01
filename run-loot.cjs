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
        console.log(`\n✅ Parsed coordinates: X=${x}, Y=${y}${z !== undefined ? `, Z=${z}` : ''}`);
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
    console.log(`📍 Starting location (INFILL): (${x}, ${y}${z !== undefined ? `, ${z}` : ''})`);
    console.log(`   These coordinates will be used as your spawn point.`);
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

    // Prepare coordinates object
    const startCoords = useCoordinates ? {
      x,
      y,
      ...(z !== undefined && { z }),
    } : undefined;
    
    if (startCoords) {
      console.log(`\n📋 Passing coordinates to pathfinding:`);
      console.log(`   startAtCoordinates: { x: ${startCoords.x}, y: ${startCoords.y}${startCoords.z !== undefined ? `, z: ${startCoords.z}` : ''} }`);
      console.log(`   startAtSpawn: false`);
    } else {
      console.log(`\n📋 Using spawn point (no custom coordinates)`);
      console.log(`   startAtSpawn: true`);
    }
    
    const options = {
      startAtSpawn: !useCoordinates, // Use spawn point if no coordinates
      startAtCoordinates: startCoords,
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

    // Verify the infill coordinates match what was entered
    if (useCoordinates && lootRun.waypoints.length > 0) {
      const firstWaypoint = lootRun.waypoints[0];
      const enteredCoords = { x, y, z };
      const actualCoords = firstWaypoint.coordinates;
      const distance = Math.sqrt(
        Math.pow(actualCoords.x - enteredCoords.x, 2) + 
        Math.pow(actualCoords.y - enteredCoords.y, 2)
      );
      
      if (distance > 1) {
        console.warn(`\n⚠️  WARNING: Infill coordinates don't match!`);
        console.warn(`   Entered: (${enteredCoords.x}, ${enteredCoords.y}${enteredCoords.z !== undefined ? `, ${enteredCoords.z}` : ''})`);
        console.warn(`   Actual:  (${actualCoords.x.toFixed(2)}, ${actualCoords.y.toFixed(2)}${actualCoords.z !== undefined ? `, ${actualCoords.z.toFixed(2)}` : ''})`);
        console.warn(`   Distance: ${distance.toFixed(2)} units`);
      } else {
        console.log(`\n✅ Infill coordinates verified: (${actualCoords.x.toFixed(2)}, ${actualCoords.y.toFixed(2)}${actualCoords.z !== undefined ? `, ${actualCoords.z.toFixed(2)}` : ''})`);
      }
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

// Map waypoint/POI types to icon folder names
function getIconFolderForType(type, subcategory) {
  const typeLower = (type || '').toLowerCase();
  const subcategoryLower = (subcategory || '').toLowerCase();
  
  // Direct type mappings
  if (typeLower === 'spawn' || subcategoryLower.includes('spawn')) {
    return 'spawn';
  }
  if (typeLower === 'extraction' || subcategoryLower.includes('extract') || subcategoryLower.includes('hatch') || subcategoryLower.includes('exfil')) {
    return 'extraction';
  }
  if (typeLower === 'cache' || subcategoryLower.includes('cache') || subcategoryLower.includes('container') || 
      subcategoryLower.includes('crate') || subcategoryLower.includes('case') || subcategoryLower.includes('locker') ||
      subcategoryLower.includes('bag') || subcategoryLower.includes('basket') || subcategoryLower.includes('box')) {
    return 'loot-containers';
  }
  if (typeLower === 'arc' || subcategoryLower.includes('arc') || subcategoryLower.includes('husk') || 
      subcategoryLower.includes('tick') || subcategoryLower.includes('wasp') || subcategoryLower.includes('sentinel') ||
      subcategoryLower.includes('bison') || subcategoryLower.includes('rollbot') || subcategoryLower.includes('turret') ||
      subcategoryLower.includes('queen') || subcategoryLower.includes('bastion') || subcategoryLower.includes('rocketeer') ||
      subcategoryLower.includes('fireball') || subcategoryLower.includes('hornet') || subcategoryLower.includes('bombardier') ||
      subcategoryLower.includes('matriarch') || subcategoryLower.includes('harvester') || subcategoryLower.includes('bees')) {
    return 'enemies-arcs';
  }
  if (subcategoryLower.includes('locked') || subcategoryLower.includes('security') || subcategoryLower.includes('key')) {
    return 'locked-rooms';
  }
  if (subcategoryLower.includes('supply') || subcategoryLower.includes('depot') || subcategoryLower.includes('station')) {
    return 'supply-stations';
  }
  if (subcategoryLower.includes('plant') || subcategoryLower.includes('mushroom') || subcategoryLower.includes('apricot') ||
      subcategoryLower.includes('agave') || subcategoryLower.includes('mullein') || subcategoryLower.includes('lemons') ||
      subcategoryLower.includes('olive') || subcategoryLower.includes('moss') || subcategoryLower.includes('fertilizer') ||
      subcategoryLower.includes('roots') || subcategoryLower.includes('prickly') || subcategoryLower.includes('pear')) {
    return 'resources-plants';
  }
  if (typeLower === 'objective' || subcategoryLower.includes('objective') || subcategoryLower.includes('quest') ||
      subcategoryLower.includes('switch') || subcategoryLower.includes('button') || subcategoryLower.includes('terminal')) {
    return 'objectives';
  }
  
  return 'other';
}

// Find icon file for a waypoint/POI, with fallback to category default
function findIconFile(name, type, subcategory) {
  if (!name) return getFallbackIcon(type, subcategory);
  
  const iconFolder = getIconFolderForType(type, subcategory);
  const iconsPath = path.join(scriptDir, 'icons-pathfinding', iconFolder);
  
  if (!fs.existsSync(iconsPath)) {
    return getFallbackIcon(type, subcategory);
  }
  
  // Clean the name to match icon file naming
  const cleanName = name
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename chars
    .trim();
  
  // Try exact match first
  const exactPath = path.join(iconsPath, `${cleanName}.png`);
  if (fs.existsSync(exactPath)) {
    return `icons-pathfinding/${iconFolder}/${cleanName}.png`;
  }
  
  // Try case-insensitive match
  try {
    const files = fs.readdirSync(iconsPath).filter(f => f.endsWith('.png'));
    const cleanNameLower = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Try multiple matching strategies
    let match = files.find(file => {
      const fileBase = file.replace('.png', '');
      const fileBaseClean = fileBase.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Exact case-insensitive match
      if (file.toLowerCase() === `${cleanName.toLowerCase()}.png`) return true;
      
      // Alphanumeric-only match
      if (fileBaseClean === cleanNameLower) return true;
      
      // Contains match (for partial names)
      if (fileBaseClean.includes(cleanNameLower) || cleanNameLower.includes(fileBaseClean)) {
        // Prefer longer matches
        return true;
      }
      
      // Try matching without common prefixes/suffixes
      const nameNoPrefix = cleanNameLower.replace(/^(near|at|on|in|the)\s*/, '').trim();
      if (fileBaseClean === nameNoPrefix || fileBaseClean.includes(nameNoPrefix)) return true;
      
      return false;
    });
    
    if (match) {
      return `icons-pathfinding/${iconFolder}/${match}`;
    }
    
    // If no match found, try fuzzy matching - find the closest match
    if (files.length > 0) {
      // Calculate similarity scores
      const scores = files.map(file => {
        const fileBase = file.replace('.png', '').toLowerCase();
        const nameLower = cleanName.toLowerCase();
        
        // Check if name contains file name or vice versa
        if (nameLower.includes(fileBase) || fileBase.includes(nameLower)) {
          return { file, score: Math.max(nameLower.length, fileBase.length) };
        }
        
        // Check word-by-word match
        const nameWords = nameLower.split(/\s+/);
        const fileWords = fileBase.split(/\s+/);
        const commonWords = nameWords.filter(w => fileWords.some(fw => fw.includes(w) || w.includes(fw)));
        if (commonWords.length > 0) {
          return { file, score: commonWords.length };
        }
        
        return { file, score: 0 };
      });
      
      // Sort by score and take the best match
      scores.sort((a, b) => b.score - a.score);
      if (scores[0] && scores[0].score > 0) {
        return `icons-pathfinding/${iconFolder}/${scores[0].file}`;
      }
    }
    
    // If no match found, use any icon from the category folder as fallback
    if (files.length > 0) {
      return `icons-pathfinding/${iconFolder}/${files[0]}`;
    }
  } catch (error) {
    // Folder doesn't exist or can't read
  }
  
  // Final fallback: return category default icon
  return getFallbackIcon(type, subcategory);
}

// Get a fallback icon for a category type
function getFallbackIcon(type, subcategory) {
  const iconFolder = getIconFolderForType(type, subcategory);
  const iconsPath = path.join(scriptDir, 'icons-pathfinding', iconFolder);
  
  if (fs.existsSync(iconsPath)) {
    try {
      const files = fs.readdirSync(iconsPath).filter(f => f.endsWith('.png'));
      if (files.length > 0) {
        // Return the first icon from the category folder
        return `icons-pathfinding/${iconFolder}/${files[0]}`;
      }
    } catch (error) {
      // Ignore errors
    }
  }
  
  // Ultimate fallback: return null (will be handled by caller)
  return null;
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
    const fallback = FALLBACK_BOUNDS[mapName] || FALLBACK_BOUNDS.dam;
    
    if (derivedCoordinates.length >= 2) {
      const xs = derivedCoordinates.map(c => c.x);
      const ys = derivedCoordinates.map(c => c.y);
      const calculatedMinX = Math.min(...xs);
      const calculatedMaxX = Math.max(...xs);
      const calculatedMinY = Math.min(...ys);
      const calculatedMaxY = Math.max(...ys);
      
      // Calculate the center of the coordinate range
      const centerX = (calculatedMinX + calculatedMaxX) / 2;
      const centerY = (calculatedMinY + calculatedMaxY) / 2;
      
      // Calculate the span from center
      const spanX = calculatedMaxX - calculatedMinX;
      const spanY = calculatedMaxY - calculatedMinY;
      
      // Use the actual coordinate range (not forcing to start at 0,0)
      // This ensures we use the full range of actual coordinates
      bounds = {
        minX: calculatedMinX,
        maxX: calculatedMaxX,
        minY: calculatedMinY,
        maxY: calculatedMaxY,
        centerX: centerX,
        centerY: centerY,
        spanX: spanX,
        spanY: spanY,
        imageWidth: mapImageInfo.width,
        imageHeight: mapImageInfo.height,
        dynamic: true,
      };
      
      console.log(`📊 Map bounds: X(${bounds.minX.toFixed(0)}-${bounds.maxX.toFixed(0)}) Y(${bounds.minY.toFixed(0)}-${bounds.maxY.toFixed(0)})`);
      console.log(`   Center: (${centerX.toFixed(0)}, ${centerY.toFixed(0)})`);
      console.log(`   Calculated from ${derivedCoordinates.length} coordinates`);
      console.log(`   Using actual coordinate range to fill entire image`);
      console.log(`   Image size: ${bounds.imageWidth}x${bounds.imageHeight}px`);
    } else {
      // Use fallback bounds
      const centerX = (fallback.minX + fallback.maxX) / 2;
      const centerY = (fallback.minY + fallback.maxY) / 2;
      bounds = {
        minX: fallback.minX,
        maxX: fallback.maxX,
        minY: fallback.minY,
        maxY: fallback.maxY,
        centerX: centerX,
        centerY: centerY,
        spanX: fallback.maxX - fallback.minX,
        spanY: fallback.maxY - fallback.minY,
        imageWidth: mapImageInfo.width,
        imageHeight: mapImageInfo.height,
        dynamic: false,
      };
      console.log(`📊 Using fallback bounds: X(${bounds.minX.toFixed(0)}-${bounds.maxX.toFixed(0)}) Y(${bounds.minY.toFixed(0)}-${bounds.maxY.toFixed(0)})`);
      console.log(`   Center: (${centerX.toFixed(0)}, ${centerY.toFixed(0)})`);
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
    
    // Two-point calibration system: origin point (0,0) + scale reference point
    // This ensures accurate placement by using one point as origin and another to calculate scale
    
    // Get user's infill coordinates (if provided)
    const infillWaypoint = lootRun.waypoints[0];
    const userInfillCoords = infillWaypoint && infillWaypoint.coordinates ? infillWaypoint.coordinates : null;
    
    // Find origin point (corner - minimum X and Y)
    const allCoords = [
      ...spawnPoints.map(sp => ({ ...sp.coordinates, name: sp.name, type: 'spawn' })),
      ...(mapData?.waypoints || []).filter(wp => wp.coordinates).map(wp => ({ ...wp.coordinates, name: wp.name, type: wp.type })),
      ...(mapData?.pois || []).filter(poi => poi.coordinates).slice(0, 50).map(poi => ({ ...poi.coordinates, name: poi.name, type: poi.type }))
    ].filter(c => c.x !== undefined && c.y !== undefined);
    
    if (allCoords.length === 0) {
      console.warn('⚠️  No coordinates available for calibration');
    }
    
    // Find point closest to minimum X and Y (corner/origin)
    let originPoint = null;
    let minDistance = Infinity;
    const minX = Math.min(...allCoords.map(c => c.x));
    const minY = Math.min(...allCoords.map(c => c.y));
    
    allCoords.forEach(coord => {
      const dist = Math.sqrt(
        Math.pow(coord.x - minX, 2) + 
        Math.pow(coord.y - minY, 2)
      );
      if (dist < minDistance) {
        minDistance = dist;
        originPoint = coord;
      }
    });
    
    // Find scale reference point (use user's infill if available, otherwise use point farthest from origin)
    let scaleRefPoint = null;
    if (userInfillCoords) {
      // Use user's infill as scale reference (most important point)
      scaleRefPoint = { x: userInfillCoords.x, y: userInfillCoords.y, name: 'Your Infill', type: 'spawn' };
      console.log(`\n📍 Using two-point calibration:`);
      console.log(`   Origin point: (${originPoint.x.toFixed(1)}, ${originPoint.y.toFixed(1)}) - ${originPoint.name || 'Corner'}`);
      console.log(`   Scale reference: (${scaleRefPoint.x.toFixed(1)}, ${scaleRefPoint.y.toFixed(1)}) - Your Infill`);
    } else if (spawnPoints.length > 0) {
      // Use spawn point farthest from origin as scale reference
      let maxDist = 0;
      spawnPoints.forEach(sp => {
        if (!sp.coordinates) return;
        const dist = Math.sqrt(
          Math.pow(sp.coordinates.x - originPoint.x, 2) + 
          Math.pow(sp.coordinates.y - originPoint.y, 2)
        );
        if (dist > maxDist) {
          maxDist = dist;
          scaleRefPoint = { ...sp.coordinates, name: sp.name, type: 'spawn' };
        }
      });
      console.log(`\n📍 Using two-point calibration:`);
      console.log(`   Origin point: (${originPoint.x.toFixed(1)}, ${originPoint.y.toFixed(1)}) - ${originPoint.name || 'Corner'}`);
      console.log(`   Scale reference: (${scaleRefPoint.x.toFixed(1)}, ${scaleRefPoint.y.toFixed(1)}) - ${scaleRefPoint.name || 'Farthest Spawn'}`);
    }
    
    // Calculate where origin point should be on the image (bottom-left corner)
    // Assume origin is at bottom-left of the map image
    const originPixelX = bounds.imageWidth * 0.05; // 5% from left edge
    const originPixelY = bounds.imageHeight * 0.95; // 5% from bottom edge
    
    // Calculate scale based on the distance between origin and scale reference point
    let scaleX = 1;
    let scaleY = 1;
    let scaleRefPixelX = originPixelX;
    let scaleRefPixelY = originPixelY;
    
    if (scaleRefPoint) {
      // Calculate API distance from origin to scale reference
      const apiDx = scaleRefPoint.x - originPoint.x;
      const apiDy = scaleRefPoint.y - originPoint.y;
      const apiDistance = Math.sqrt(apiDx * apiDx + apiDy * apiDy);
      
      // Calculate where scale reference should be on image (top-right area)
      // Use the full image span to determine scale
      const spanX = bounds.maxX - bounds.minX || 1;
      const spanY = bounds.maxY - bounds.minY || 1;
      
      // Calculate normalized position of scale reference relative to origin
      const normX = apiDx / spanX;
      const normY = apiDy / spanY;
      
      // Map to pixel position (use most of the image, leave margins)
      const margin = 0.05;
      scaleRefPixelX = originPixelX + normX * (bounds.imageWidth * (1 - 2 * margin));
      scaleRefPixelY = originPixelY - normY * (bounds.imageHeight * (1 - 2 * margin)); // Flip Y
      
      // Calculate scale factors
      if (Math.abs(apiDx) > 0.001) {
        const pixelDx = scaleRefPixelX - originPixelX;
        scaleX = pixelDx / apiDx;
      }
      if (Math.abs(apiDy) > 0.001) {
        const pixelDy = originPixelY - scaleRefPixelY; // Note: Y is flipped
        scaleY = pixelDy / apiDy;
      }
      
      console.log(`   Scale factors: X=${scaleX.toFixed(6)} px/unit, Y=${scaleY.toFixed(6)} px/unit`);
      console.log(`   Origin pixel: (${originPixelX.toFixed(1)}, ${originPixelY.toFixed(1)})`);
      console.log(`   Scale ref pixel: (${scaleRefPixelX.toFixed(1)}, ${scaleRefPixelY.toFixed(1)})`);
    }
    
    // Store calibration parameters
    const twoPointCalibration = {
      originApi: { x: originPoint.x, y: originPoint.y },
      originPixel: { x: originPixelX, y: originPixelY },
      scaleRefApi: scaleRefPoint ? { x: scaleRefPoint.x, y: scaleRefPoint.y } : null,
      scaleRefPixel: scaleRefPoint ? { x: scaleRefPixelX, y: scaleRefPixelY } : null,
      scaleX: scaleX,
      scaleY: scaleY
    };
    
    // Load calibration if available (for custom map images)
    const calibrationPath = path.join(scriptDir, `map-calibration-${mapName}.json`);
    let calibration = null;
    if (fs.existsSync(calibrationPath)) {
      try {
        calibration = JSON.parse(fs.readFileSync(calibrationPath, 'utf8'));
        console.log(`\n✅ Using custom map calibration from: map-calibration-${mapName}.json`);
        console.log(`   Calibrated with ${calibration.referencePoints.length} reference points`);
      } catch (error) {
        console.warn(`⚠️  Could not load calibration: ${error.message}`);
      }
    }
    
    // Calculate coordinate to pixel transformation
    // Uses calibration if available, otherwise uses center-based mapping
    const coordToPixel = (coord) => {
      // If calibration exists, use it
      if (calibration && calibration.transformation) {
        const t = calibration.transformation;
        
        // Check if it's origin-based calibration
        if (calibration.originBased) {
          // Origin-based: pixel = (api - originApi) * scale + originPixel
          const apiRelativeX = coord.x - (t.originApiX || 0);
          const apiRelativeY = coord.y - (t.originApiY || 0);
          const pixelX = apiRelativeX * t.scaleX + t.originOffsetX;
          const pixelY = apiRelativeY * t.scaleY + t.originOffsetY;
          return { x: pixelX, y: pixelY };
        } else {
          // Center-based (legacy): pixel = (api - apiCenter) * scale + pixelCenter
          const pixelX = (coord.x - (t.apiCenterX || 0)) * t.scaleX + (t.pixelCenterX || 0);
          const pixelY = (coord.y - (t.apiCenterY || 0)) * t.scaleY + (t.pixelCenterY || 0);
          return { x: pixelX, y: pixelY };
        }
      }
      
      // Fallback: Center-based mapping (original logic)
      const centerX = bounds.centerX || (bounds.minX + bounds.maxX) / 2;
      const centerY = bounds.centerY || (bounds.minY + bounds.maxY) / 2;
      const spanX = bounds.spanX || (bounds.maxX - bounds.minX) || 1;
      const spanY = bounds.spanY || (bounds.maxY - bounds.minY) || 1;
      
      // Calculate scale factors to fill the entire image
      const scaleX = bounds.imageWidth / spanX;
      const scaleY = bounds.imageHeight / spanY;
      
      // Transform coordinates relative to center
      const dx = coord.x - centerX;
      const dy = coord.y - centerY;
      
      // Map to pixel coordinates, centering the coordinate system in the image
      // Image center is at (imageWidth/2, imageHeight/2)
      const pixelX = (bounds.imageWidth / 2) + (dx * scaleX);
      const pixelY = (bounds.imageHeight / 2) - (dy * scaleY); // Flip Y axis (game Y increases up, image Y increases down)
      
      return { x: pixelX, y: pixelY };
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
                    
                    <!-- Draw icons for ALL waypoints and POIs from map data -->
                    <g class="map-icons">
                      ${(() => {
                        const iconElements = [];
                        const iconSize = 24; // Icon size in pixels (reduced from 32)
                        const iconOffset = iconSize / 2; // Center the icon
                        let iconCount = 0;
                        
                        // Calculate map center for debugging
                        const centerX = (bounds.minX + bounds.maxX) / 2;
                        const centerY = (bounds.minY + bounds.maxY) / 2;
                        const centerRadius = Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.15; // 15% of map size
                        let centerIcons = 0;
                        let outOfBoundsCount = 0;
                        
                        // Render icons for ALL waypoints - EVERY SINGLE ONE, NO MATTER WHAT
                        if (mapData?.waypoints) {
                          mapData.waypoints.forEach(wp => {
                            if (!wp.coordinates) return; // Only skip if no coordinates
                            
                            const pixel = coordToPixel(wp.coordinates);
                            
                            // Always try to find an icon, use fallback if needed
                            let iconPath = findIconFile(wp.name || 'Unknown', wp.type, wp.name || '');
                            
                            // If no icon found, use a colored circle as fallback - STILL SHOW IT
                            if (!iconPath) {
                              const typeColors = {
                                'spawn': '#ffffff',
                                'extraction': '#26c6da',
                                'cache': '#e0e0e0',
                                'arc': '#ef5350',
                                'objective': '#ffeb3b',
                                'other': '#9e9e9e'
                              };
                              const color = typeColors[wp.type || 'other'] || '#9e9e9e';
                              iconElements.push(
                                `<circle cx="${pixel.x}" cy="${pixel.y}" r="${iconSize / 2}" fill="${color}" opacity="0.7" stroke="#ffffff" stroke-width="1" title="${wp.name || 'Unknown'} (${wp.type || 'unknown'}) [${wp.coordinates.x.toFixed(0)}, ${wp.coordinates.y.toFixed(0)}]" />`
                              );
                            } else {
                              iconElements.push(
                                `<image href="${iconPath}" x="${pixel.x - iconOffset}" y="${pixel.y - iconOffset}" width="${iconSize}" height="${iconSize}" opacity="0.9" title="${wp.name || 'Unknown'} (${wp.type || 'unknown'}) [${wp.coordinates.x.toFixed(0)}, ${wp.coordinates.y.toFixed(0)}]" />`
                              );
                            }
                            
                            // Check if near center
                            const distFromCenter = Math.sqrt(
                              Math.pow(wp.coordinates.x - centerX, 2) + 
                              Math.pow(wp.coordinates.y - centerY, 2)
                            );
                            if (distFromCenter < centerRadius) centerIcons++;
                            
                            // Check if icon is within map bounds
                            const isInBounds = pixel.x >= -iconSize && pixel.x <= bounds.imageWidth + iconSize && 
                                              pixel.y >= -iconSize && pixel.y <= bounds.imageHeight + iconSize;
                            if (!isInBounds) outOfBoundsCount++;
                            
                            iconCount++;
                          });
                        }
                        
                        // Render icons for ALL POIs - EVERY SINGLE ONE, NO MATTER WHAT
                        if (mapData?.pois) {
                          mapData.pois.forEach(poi => {
                            if (!poi.coordinates) return; // Only skip if no coordinates
                            
                            const pixel = coordToPixel(poi.coordinates);
                            
                            // Always try to find an icon, use fallback if needed
                            let iconPath = findIconFile(poi.name || 'Unknown', poi.type, poi.name || '');
                            
                            // If no icon found, use a colored circle as fallback - STILL SHOW IT
                            if (!iconPath) {
                              const typeColors = {
                                'cache': '#e0e0e0',
                                'arc': '#ef5350',
                                'objective': '#ffeb3b',
                                'spawn': '#ffffff',
                                'extraction': '#26c6da',
                                'other': '#9e9e9e'
                              };
                              const color = typeColors[poi.type || 'other'] || '#9e9e9e';
                              iconElements.push(
                                `<circle cx="${pixel.x}" cy="${pixel.y}" r="${iconSize / 2}" fill="${color}" opacity="0.7" stroke="#ffffff" stroke-width="1" title="${poi.name || 'Unknown'} (${poi.type || 'unknown'}) [${poi.coordinates.x.toFixed(0)}, ${poi.coordinates.y.toFixed(0)}]" />`
                              );
                            } else {
                              iconElements.push(
                                `<image href="${iconPath}" x="${pixel.x - iconOffset}" y="${pixel.y - iconOffset}" width="${iconSize}" height="${iconSize}" opacity="0.9" title="${poi.name || 'Unknown'} (${poi.type || 'unknown'}) [${poi.coordinates.x.toFixed(0)}, ${poi.coordinates.y.toFixed(0)}]" />`
                              );
                            }
                            
                            // Check if near center
                            const distFromCenter = Math.sqrt(
                              Math.pow(poi.coordinates.x - centerX, 2) + 
                              Math.pow(poi.coordinates.y - centerY, 2)
                            );
                            if (distFromCenter < centerRadius) centerIcons++;
                            
                            // Check if icon is within map bounds
                            const isInBounds = pixel.x >= -iconSize && pixel.x <= bounds.imageWidth + iconSize && 
                                              pixel.y >= -iconSize && pixel.y <= bounds.imageHeight + iconSize;
                            if (!isInBounds) outOfBoundsCount++;
                            
                            iconCount++;
                          });
                        }
                        
                        // Log summary with debugging info
                        console.log(`✅ Rendered ${iconCount} icons on map`);
                        console.log(`   - ${centerIcons} icons near map center (within ${centerRadius.toFixed(0)} units of center)`);
                        if (outOfBoundsCount > 0) {
                          console.log(`   ⚠️  ${outOfBoundsCount} icons placed outside visible bounds`);
                        }
                        if (mapData?.waypoints) {
                          console.log(`   - ${mapData.waypoints.length} waypoints processed`);
                        }
                        if (mapData?.pois) {
                          console.log(`   - ${mapData.pois.length} POIs processed`);
                        }
                        console.log(`   - Map center: (${centerX.toFixed(0)}, ${centerY.toFixed(0)})`);
                        console.log(`   - Bounds: X(${bounds.minX.toFixed(0)}-${bounds.maxX.toFixed(0)}) Y(${bounds.minY.toFixed(0)}-${bounds.maxY.toFixed(0)})`);
                        console.log(`   - Image size: ${bounds.imageWidth}x${bounds.imageHeight}px`);
                        console.log(`   - Scale: ${(bounds.imageWidth / (bounds.maxX - bounds.minX)).toFixed(2)}px per X unit, ${(bounds.imageHeight / (bounds.maxY - bounds.minY)).toFixed(2)}px per Y unit`);
                        
                        // Show sample coordinate transformations for debugging
                        if (mapData?.waypoints && mapData.waypoints.length > 0) {
                          const sample = mapData.waypoints[0];
                          if (sample.coordinates) {
                            const samplePixel = coordToPixel(sample.coordinates);
                            console.log(`   - Sample: "${sample.name}" at (${sample.coordinates.x.toFixed(0)}, ${sample.coordinates.y.toFixed(0)}) -> pixel (${samplePixel.x.toFixed(0)}, ${samplePixel.y.toFixed(0)})`);
                          }
                        }
                        
                        return iconElements.join('\n                      ');
                      })()}
                    </g>
                    
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
                      // The first waypoint is the INFILL (user's spawn location)
                      const userSpawnCoords = firstWaypoint.coordinates;
                      
                      // Early spawn arrows (from waypointSpawnAnalysis)
                      if (risk.waypointSpawnAnalysis && risk.waypointSpawnAnalysis.length > 0) {
                        for (const analysis of risk.waypointSpawnAnalysis) {
                          // Skip if this is the user's spawn point
                          const spawnCoords = analysis.closestSpawn.coordinates;
                          // Use a more accurate distance check (within 5 units = same spawn)
                          const distToUserSpawn = Math.sqrt(
                            Math.pow(spawnCoords.x - userSpawnCoords.x, 2) + 
                            Math.pow(spawnCoords.y - userSpawnCoords.y, 2)
                          );
                          if (distToUserSpawn < 5) continue; // Skip user's own spawn (more accurate threshold)
                          
                          const waypointPixel = coordToPixel(lootRun.waypoints[analysis.waypointIndex].coordinates);
                          const spawnPixel = coordToPixel(spawnCoords);
                          
                          // Calculate arrow direction
                          const dx = waypointPixel.x - spawnPixel.x;
                          const dy = waypointPixel.y - spawnPixel.y;
                          const distance = Math.sqrt(dx * dx + dy * dy);
                          if (distance < 1) continue; // Skip if too close
                          const angle = Math.atan2(dy, dx);
                          
                          // Offset arrow start/end to avoid overlapping with waypoint circles
                          // Increased offset for better visibility
                          const waypointRadius = 10;
                          const spawnRadius = 8;
                          const offsetStart = spawnRadius + 15; // Increased from 5 to 15
                          const offsetEnd = waypointRadius + 15; // Increased from 5 to 15
                          
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

        <div class="legend" style="margin-top: 20px;">
            <h3>🗺️ Map Icons Legend</h3>
            <p style="color: #b0b0b0; font-size: 13px; margin-bottom: 15px;">
                Icons on the map represent different location types. Hover over icons to see details.
            </p>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                ${(() => {
                  const iconCategories = [
                    { folder: 'spawn', name: 'Player Spawn Points', color: '#ffffff', shape: 'arrow_down' },
                    { folder: 'extraction', name: 'Extraction Points', color: '#26c6da', shape: 'arrow_up' },
                    { folder: 'loot-containers', name: 'Loot Containers', color: '#e0e0e0', shape: 'box' },
                    { folder: 'locked-rooms', name: 'Locked Rooms', color: '#fbc02d', shape: 'padlock' },
                    { folder: 'enemies-arcs', name: 'ARC Enemies', color: '#ef5350', shape: 'diamond' },
                    { folder: 'objectives', name: 'Quest Objectives', color: '#ffeb3b', shape: 'star' },
                    { folder: 'resources-plants', name: 'Harvestable Plants', color: '#66bb6a', shape: 'leaf' },
                    { folder: 'supply-stations', name: 'Supply Stations', color: '#bdbdbd', shape: 'radio' },
                    { folder: 'other', name: 'Other Items', color: '#9e9e9e', shape: 'circle' },
                  ];
                  
                  return iconCategories.map(cat => {
                    // Try to find a sample icon from this category
                    const sampleIconPath = path.join(scriptDir, 'icons-pathfinding', cat.folder);
                    let sampleIcon = null;
                    try {
                      if (fs.existsSync(sampleIconPath)) {
                        const files = fs.readdirSync(sampleIconPath).filter(f => f.endsWith('.png') && f !== 'icon-names.txt');
                        if (files.length > 0) {
                          sampleIcon = `icons-pathfinding/${cat.folder}/${files[0]}`;
                        }
                      }
                    } catch (e) {
                      // Ignore errors
                    }
                    
                    return `
                <div class="legend-item" style="display: flex; align-items: center; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                    ${sampleIcon ? `<img src="${sampleIcon}" width="24" height="24" style="margin-right: 10px; opacity: 0.9;" />` : `<div class="legend-color" style="background: ${cat.color}; width: 24px; height: 24px; margin-right: 10px;"></div>`}
                    <span>${cat.name}</span>
                </div>`;
                  }).join('\n');
                })()}
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

