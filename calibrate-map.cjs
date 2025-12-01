#!/usr/bin/env node

/**
 * Map Calibration Tool
 * 
 * Converts API coordinates to your custom map image coordinates.
 * 
 * Usage:
 *   node calibrate-map.cjs <map-name>
 * 
 * This will:
 * 1. Show you known coordinates from the API
 * 2. Let you specify where those coordinates are on YOUR map image
 * 3. Calculate the transformation to convert all API coordinates to your map
 * 4. Save the calibration data
 */

const { createArcRaidersClient } = require('./dist/index.js');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const scriptDir = __dirname;

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function calibrateMap(mapName) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🗺️  Map Calibration: ${mapName.toUpperCase()}`);
  console.log('='.repeat(70));
  
  // Get map data from API
  const client = createArcRaidersClient({ usePersistentCache: true });
  const mapData = await client.getMapData(mapName);
  
  // Get map image info
  const mapImagePath = path.join(scriptDir, `map-${mapName}.png`);
  if (!fs.existsSync(mapImagePath)) {
    console.error(`\n❌ Map image not found: map-${mapName}.png`);
    console.error(`   Please save your map image as: map-${mapName}.png`);
    process.exit(1);
  }
  
  const { imageSize } = require('image-size');
  const imageBuffer = fs.readFileSync(mapImagePath);
  const { width, height } = imageSize(imageBuffer);
  
  console.log(`\n📸 Your Map Image:`);
  console.log(`   File: map-${mapName}.png`);
  console.log(`   Size: ${width}×${height}px`);
  
  // Show available spawn points and landmarks
  console.log(`\n📍 Available Reference Points from API:`);
  
  const spawnPoints = (mapData.waypoints || []).filter(wp => wp.type === 'spawn' && wp.coordinates);
  const extractionPoints = (mapData.waypoints || []).filter(wp => wp.type === 'extraction' && wp.coordinates);
  const landmarks = (mapData.pois || []).filter(poi => poi.coordinates && poi.name);
  
  console.log(`\n   Spawn Points (${spawnPoints.length}):`);
  spawnPoints.slice(0, 10).forEach((sp, i) => {
    console.log(`   ${i + 1}. ${sp.name || 'Spawn'} - (${sp.coordinates.x.toFixed(1)}, ${sp.coordinates.y.toFixed(1)})`);
  });
  if (spawnPoints.length > 10) {
    console.log(`   ... and ${spawnPoints.length - 10} more`);
  }
  
  console.log(`\n   Extraction Points (${extractionPoints.length}):`);
  extractionPoints.slice(0, 5).forEach((ep, i) => {
    console.log(`   ${i + 1}. ${ep.name || 'Extraction'} - (${ep.coordinates.x.toFixed(1)}, ${ep.coordinates.y.toFixed(1)})`);
  });
  
  console.log(`\n   Landmarks (${landmarks.length}):`);
  landmarks.slice(0, 10).forEach((lm, i) => {
    console.log(`   ${i + 1}. ${lm.name} - (${lm.coordinates.x.toFixed(1)}, ${lm.coordinates.y.toFixed(1)})`);
  });
  
  // Automatic calibration: Find corner/reference point and use as origin
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📌 Automatic Calibration: Map API Coordinates to Your Image`);
  console.log('='.repeat(70));
  console.log(`\nThis will automatically find a corner/reference point and use it as (0,0).`);
  console.log(`All other points will be mapped relative to this origin.`);
  
  // Find the minimum coordinate point (likely a corner)
  const allCoords = [
    ...spawnPoints.map(sp => ({ ...sp.coordinates, name: sp.name, type: 'spawn' })),
    ...extractionPoints.map(ep => ({ ...ep.coordinates, name: ep.name, type: 'extraction' })),
    ...landmarks.slice(0, 20).map(lm => ({ ...lm.coordinates, name: lm.name, type: 'landmark' }))
  ].filter(c => c.x !== undefined && c.y !== undefined);
  
  if (allCoords.length === 0) {
    console.error(`\n❌ No coordinates found in API data`);
    process.exit(1);
  }
  
  // Find the corner point (minimum X and Y, or closest to (0,0))
  const minX = Math.min(...allCoords.map(c => c.x));
  const minY = Math.min(...allCoords.map(c => c.y));
  const maxX = Math.max(...allCoords.map(c => c.x));
  const maxY = Math.max(...allCoords.map(c => c.y));
  
  // Find point closest to the corner (minimum X and Y)
  let cornerPoint = null;
  let minDistance = Infinity;
  
  allCoords.forEach(coord => {
    // Distance from bottom-left corner (minX, minY)
    const dist = Math.sqrt(
      Math.pow(coord.x - minX, 2) + 
      Math.pow(coord.y - minY, 2)
    );
    if (dist < minDistance) {
      minDistance = dist;
      cornerPoint = coord;
    }
  });
  
  if (!cornerPoint) {
    console.error(`\n❌ Could not find corner point`);
    process.exit(1);
  }
  
  console.log(`\n📍 Automatic Origin Point Selected:`);
  console.log(`   Location: ${cornerPoint.name || 'Corner Point'}`);
  console.log(`   API Coordinate: (${cornerPoint.x.toFixed(1)}, ${cornerPoint.y.toFixed(1)})`);
  console.log(`   This will be treated as (0,0) relative to your map`);
  
  // Ask user where this point is on their map image
  console.log(`\nStep 1: Locate the origin point on your map image`);
  console.log(`   Find "${cornerPoint.name || 'the corner point'}" on your map image.`);
  console.log(`   This point at API (${cornerPoint.x.toFixed(1)}, ${cornerPoint.y.toFixed(1)}) will be your (0,0) origin.`);
  
  const originInput = await question(`\nEnter pixel position of this point on your image (X Y): `);
  const originParts = originInput.trim().split(/\s+/);
  if (originParts.length !== 2) {
    console.error(`\n❌ Invalid format. Please enter two numbers: X Y`);
    process.exit(1);
  }
  
  const originPixelX = parseFloat(originParts[0]);
  const originPixelY = parseFloat(originParts[1]);
  
  if (isNaN(originPixelX) || isNaN(originPixelY)) {
    console.error(`\n❌ Invalid numbers. Please enter valid pixel coordinates.`);
    process.exit(1);
  }
  
  if (originPixelX < 0 || originPixelX > width || originPixelY < 0 || originPixelY > height) {
    console.warn(`\n⚠️  Warning: Pixel coordinates (${originPixelX}, ${originPixelY}) are outside image bounds (0-${width}, 0-${height})`);
  }
  
  console.log(`✅ Origin set at pixel (${originPixelX}, ${originPixelY})`);
  
  // Now get reference points for scaling (relative to the origin)
  console.log(`\nStep 2: Identify reference points for scaling`);
  console.log(`You need at least 1 more reference point to calculate the scale.`);
  console.log(`More points = better accuracy (recommended: 2-3 additional points).`);
  console.log(`\nFor each reference point:`);
  console.log(`  1. Find a location on your map image (spawn, landmark, extraction, etc.)`);
  console.log(`  2. Note the pixel position (X, Y) on your image`);
  console.log(`  3. Find the matching API coordinate from the list above`);
  console.log(`\nExample:`);
  console.log(`  If a spawn point at API coordinate (3749, 4008) is at pixel (450, 300) on your image:`);
  console.log(`  Enter: 3749 4008 450 300`);
  
  const referencePoints = [];
  let pointNum = 1;
  
  while (referencePoints.length < 2) {
    console.log(`\n--- Reference Point ${pointNum} ---`);
    
    const input = await question(`Enter: API_X API_Y PIXEL_X PIXEL_Y (or 'done' if you have 2+ points): `);
    
    if (input.toLowerCase() === 'done' && referencePoints.length >= 2) {
      break;
    }
    
    const parts = input.trim().split(/\s+/);
    if (parts.length !== 4) {
      console.log(`❌ Invalid format. Enter 4 numbers: API_X API_Y PIXEL_X PIXEL_Y`);
      continue;
    }
    
    const apiX = parseFloat(parts[0]);
    const apiY = parseFloat(parts[1]);
    const pixelX = parseFloat(parts[2]);
    const pixelY = parseFloat(parts[3]);
    
    if (isNaN(apiX) || isNaN(apiY) || isNaN(pixelX) || isNaN(pixelY)) {
      console.log(`❌ Invalid numbers. Please enter valid numbers.`);
      continue;
    }
    
    if (pixelX < 0 || pixelX > width || pixelY < 0 || pixelY > height) {
      console.log(`⚠️  Warning: Pixel coordinates (${pixelX}, ${pixelY}) are outside image bounds (0-${width}, 0-${height})`);
      const confirm = await question(`Continue anyway? (y/n): `);
      if (confirm.toLowerCase() !== 'y') {
        continue;
      }
    }
    
    referencePoints.push({
      apiCoord: { x: apiX, y: apiY },
      pixel: { x: pixelX, y: pixelY }
    });
    
    console.log(`✅ Added: API (${apiX}, ${apiY}) -> Pixel (${pixelX}, ${pixelY})`);
    pointNum++;
    
    if (referencePoints.length >= 2) {
      const more = await question(`\nAdd more reference points? (y/n, recommended: 3-4 points): `);
      if (more.toLowerCase() !== 'y') {
        break;
      }
    }
  }
  
  if (referencePoints.length < 1) {
    console.error(`\n❌ Need at least 1 reference point for calibration`);
    process.exit(1);
  }
  
  // Calculate transformation using least squares with multiple reference points
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔧 Calculating Transformation (using ${referencePoints.length} reference points)...`);
  console.log('='.repeat(70));
  
  // The corner point is our origin (0,0 in relative coordinates)
  const apiOriginX = cornerPoint.x;
  const apiOriginY = cornerPoint.y;
  const pixelOriginX = originPixelX;
  const pixelOriginY = originPixelY;
  
  console.log(`\n📍 Origin Point (0,0 relative):`);
  console.log(`   API Coordinate: (${apiOriginX.toFixed(1)}, ${apiOriginY.toFixed(1)})`);
  console.log(`   Pixel Position: (${pixelOriginX.toFixed(1)}, ${pixelOriginY.toFixed(1)})`);
  console.log(`   All coordinates will be relative to this point`);
  
  // Use least squares to calculate best-fit scale factors
  // Formula: pixel = (api - origin) * scale + originPixel
  // For each reference point: pixelRelative = apiRelative * scale
  // Using least squares: minimize sum of squared errors
  
  // Calculate scale factors using least squares method
  // For X: scaleX = sum(pixelRelativeX * apiRelativeX) / sum(apiRelativeX^2)
  // For Y: scaleY = sum(pixelRelativeY * apiRelativeY) / sum(apiRelativeY^2)
  
  let sumPixelXApiX = 0;
  let sumApiX2 = 0;
  let sumPixelYApiY = 0;
  let sumApiY2 = 0;
  
  referencePoints.forEach(ref => {
    // Calculate relative positions from origin
    const apiRelativeX = ref.apiCoord.x - apiOriginX;
    const apiRelativeY = ref.apiCoord.y - apiOriginY;
    const pixelRelativeX = ref.pixel.x - pixelOriginX;
    const pixelRelativeY = ref.pixel.y - pixelOriginY;
    
    // Accumulate for least squares
    sumPixelXApiX += pixelRelativeX * apiRelativeX;
    sumApiX2 += apiRelativeX * apiRelativeX;
    sumPixelYApiY += pixelRelativeY * apiRelativeY;
    sumApiY2 += apiRelativeY * apiRelativeY;
  });
  
  // Calculate scale factors using least squares
  const scaleX = sumApiX2 > 0.0001 ? sumPixelXApiX / sumApiX2 : 1;
  const scaleY = sumApiY2 > 0.0001 ? sumPixelYApiY / sumApiY2 : 1;
  
  // Origin offset (where the origin point maps to)
  const originOffsetX = pixelOriginX;
  const originOffsetY = pixelOriginY;
  
  // Verify with additional reference point if available
  if (referencePoints.length >= 2) {
    console.log(`\n📐 Using least squares method with ${referencePoints.length} reference points`);
    console.log(`   This ensures the transformation is properly "squared" and accurate`);
  }
  
  // Test the transformation on ALL reference points
  console.log(`\n📊 Transformation Parameters (Origin-Based, Least Squares):`);
  console.log(`   Origin API: (${apiOriginX.toFixed(1)}, ${apiOriginY.toFixed(1)})`);
  console.log(`   Origin Pixel: (${originOffsetX.toFixed(2)}, ${originOffsetY.toFixed(2)})`);
  console.log(`   Scale X: ${scaleX.toFixed(6)} px per API unit`);
  console.log(`   Scale Y: ${scaleY.toFixed(6)} px per API unit`);
  console.log(`   Formula: pixelX = (apiX - ${apiOriginX.toFixed(1)}) * ${scaleX.toFixed(6)} + ${originOffsetX.toFixed(2)}`);
  console.log(`   Formula: pixelY = (apiY - ${apiOriginY.toFixed(1)}) * ${scaleY.toFixed(6)} + ${originOffsetY.toFixed(2)}`);
  
  console.log(`\n🧪 Testing Transformation on ALL Reference Points:`);
  let totalError = 0;
  let maxError = 0;
  let minError = Infinity;
  
  referencePoints.forEach((ref, i) => {
    // Apply transformation: pixel = (api - origin) * scale + originPixel
    const apiRelativeX = ref.apiCoord.x - apiOriginX;
    const apiRelativeY = ref.apiCoord.y - apiOriginY;
    const testPixelX = apiRelativeX * scaleX + originOffsetX;
    const testPixelY = apiRelativeY * scaleY + originOffsetY;
    
    const errorX = Math.abs(testPixelX - ref.pixel.x);
    const errorY = Math.abs(testPixelY - ref.pixel.y);
    const error = Math.sqrt(errorX * errorX + errorY * errorY);
    totalError += error;
    maxError = Math.max(maxError, error);
    minError = Math.min(minError, error);
    
    const status = error < 2 ? '✅' : error < 5 ? '⚠️' : '❌';
    console.log(`   ${status} Point ${i + 1}: API (${ref.apiCoord.x.toFixed(1)}, ${ref.apiCoord.y.toFixed(1)})`);
    console.log(`      Expected: (${ref.pixel.x.toFixed(1)}, ${ref.pixel.y.toFixed(1)})`);
    console.log(`      Calculated: (${testPixelX.toFixed(1)}, ${testPixelY.toFixed(1)})`);
    console.log(`      Error: ${error.toFixed(2)}px (X: ${errorX.toFixed(2)}, Y: ${errorY.toFixed(2)})`);
  });
  
  const avgError = totalError / referencePoints.length;
  console.log(`\n📈 Error Statistics:`);
  console.log(`   Average Error: ${avgError.toFixed(2)}px`);
  console.log(`   Min Error: ${minError.toFixed(2)}px`);
  console.log(`   Max Error: ${maxError.toFixed(2)}px`);
  
  if (avgError > 5) {
    console.log(`\n⚠️  Warning: Average error is ${avgError.toFixed(2)}px`);
    console.log(`   Consider:`);
    console.log(`   - Adding more reference points (especially far from origin)`);
    console.log(`   - Double-checking your pixel coordinates`);
    console.log(`   - Ensuring reference points are spread across the map`);
  } else if (avgError > 2) {
    console.log(`\n✅ Good accuracy! Average error is ${avgError.toFixed(2)}px`);
  } else {
    console.log(`\n✅ Excellent accuracy! Average error is ${avgError.toFixed(2)}px`);
  }
  
  // Save calibration data
  const calibration = {
    mapName: mapName,
    imageWidth: width,
    imageHeight: height,
    originBased: true,
    originApi: { x: apiOriginX, y: apiOriginY },
    originPixel: { x: originOffsetX, y: originOffsetY },
    originName: cornerPoint.name || 'Corner Point',
    referencePoints: referencePoints,
    transformation: {
      scaleX: scaleX,
      scaleY: scaleY,
      originApiX: apiOriginX,
      originApiY: apiOriginY,
      originOffsetX: originOffsetX,
      originOffsetY: originOffsetY,
      // Formula: pixelX = (apiX - originApiX) * scaleX + originOffsetX
      // Formula: pixelY = (apiY - originApiY) * scaleY + originOffsetY
    },
    createdAt: new Date().toISOString()
  };
  
  const calibrationPath = path.join(scriptDir, `map-calibration-${mapName}.json`);
  fs.writeFileSync(calibrationPath, JSON.stringify(calibration, null, 2));
  
  console.log(`\n✅ Calibration saved to: map-calibration-${mapName}.json`);
  console.log(`\n💡 This calibration will be used automatically when generating map overlays!`);
  
  rl.close();
}

// Main
const mapName = process.argv[2];
if (!mapName) {
  console.log(`
Usage: node calibrate-map.cjs <map-name>

Example: node calibrate-map.cjs dam

This will help you calibrate your custom map image to match the API coordinate system.
  `);
  process.exit(1);
}

calibrateMap(mapName).catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

