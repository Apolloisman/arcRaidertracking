#!/usr/bin/env node

/**
 * Quick script to find location coordinates by name
 */

const { createArcRaidersClient } = require('./dist/index.js');

async function findLocation(mapName, locationName) {
  try {
    const client = createArcRaidersClient();
    const mapData = await client.getMapData(mapName);
    
    const searchLower = locationName.toLowerCase();
    
    // Search in waypoints
    const waypointMatches = (mapData.waypoints || []).filter(wp => 
      wp.name && wp.name.toLowerCase().includes(searchLower)
    );
    
    // Search in POIs
    const poiMatches = (mapData.pois || []).filter(poi => 
      poi.name && poi.name.toLowerCase().includes(searchLower)
    );
    
    console.log(`\n🔍 Searching for "${locationName}" on map: ${mapName}\n`);
    
    if (waypointMatches.length > 0) {
      console.log('📍 Found in Waypoints:');
      waypointMatches.forEach(wp => {
        if (wp.coordinates) {
          console.log(`   ${wp.name}: (${wp.coordinates.x}, ${wp.coordinates.y}${wp.coordinates.z !== undefined ? `, ${wp.coordinates.z}` : ''})`);
        }
      });
    }
    
    if (poiMatches.length > 0) {
      console.log('\n📍 Found in POIs:');
      poiMatches.forEach(poi => {
        if (poi.coordinates) {
          console.log(`   ${poi.name}: (${poi.coordinates.x}, ${poi.coordinates.y}${poi.coordinates.z !== undefined ? `, ${poi.coordinates.z}` : ''})`);
        }
      });
    }
    
    if (waypointMatches.length === 0 && poiMatches.length === 0) {
      console.log('❌ No matches found. Try searching for a partial name.');
      console.log('\nAvailable locations (first 20):');
      const allNames = [
        ...(mapData.waypoints || []).map(wp => wp.name).filter(Boolean),
        ...(mapData.pois || []).map(poi => poi.name).filter(Boolean)
      ].slice(0, 20);
      allNames.forEach(name => console.log(`   - ${name}`));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node find-location.cjs <map-name> <location-name>');
  console.log('Example: node find-location.cjs dam "water treatment"');
  process.exit(1);
}

findLocation(args[0], args[1]);

