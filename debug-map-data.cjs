#!/usr/bin/env node

/**
 * Debug script to see what categories and names are in the map data
 */

const { createArcRaidersClient } = require('./dist/index.js');

async function debugMapData(mapName) {
  try {
    const client = createArcRaidersClient();
    
    // Get raw map data (will use cache if available)
    const mapData = await client.getMapData(mapName);
    
    // We need to access the raw API response, but since it's cached/transformed,
    // let's check what we have and also look for extraction-related terms
    console.log(`\n🔍 Debugging map data for: ${mapName}`);
    console.log('─'.repeat(70));
    
    // Check waypoints
    const waypoints = mapData.waypoints || [];
    console.log(`\n📌 Total waypoints: ${waypoints.length}`);
    
    const spawns = waypoints.filter(w => w.type === 'spawn');
    const extractions = waypoints.filter(w => w.type === 'extraction');
    
    console.log(`   Spawns: ${spawns.length}`);
    console.log(`   Extractions: ${extractions.length}`);
    
    if (extractions.length > 0) {
      console.log('\n   🔴 EXTRACTION POINTS FOUND:');
      extractions.forEach((ext, i) => {
        console.log(`      ${i + 1}. ${ext.name} (${ext.coordinates.x.toFixed(1)}, ${ext.coordinates.y.toFixed(1)})`);
      });
    } else {
      console.log('\n   ⚠️  No extraction points found in waypoints');
    }
    
    // Check POIs for anything that might be extraction/hatch related
    const pois = mapData.pois || [];
    console.log(`\n📦 Total POIs: ${pois.length}`);
    
    // Look for extraction/hatch related terms in POI names
    const extractionLikePOIs = pois.filter(poi => {
      const name = (poi.name || '').toLowerCase();
      const type = (poi.type || '').toLowerCase();
      return name.includes('extraction') ||
             name.includes('extract') ||
             name.includes('exfil') ||
             name.includes('hatch') ||
             name.includes('departure') ||
             name.includes('evac') ||
             name.includes('exit') ||
             name.includes('escape') ||
             name.includes('helipad') ||
             name.includes('landing') ||
             name.includes('pickup') ||
             type.includes('extraction') ||
             type.includes('hatch');
    });
    
    // Also check waypoints for extraction-related terms
    const extractionLikeWaypoints = waypoints.filter(wp => {
      const name = (wp.name || '').toLowerCase();
      return name.includes('extraction') ||
             name.includes('extract') ||
             name.includes('exfil') ||
             name.includes('hatch') ||
             name.includes('departure') ||
             name.includes('evac');
    });
    
    if (extractionLikeWaypoints.length > 0) {
      console.log(`\n   🔍 Found ${extractionLikeWaypoints.length} waypoints with extraction/hatch-related names:`);
      extractionLikeWaypoints.forEach((wp, i) => {
        console.log(`      ${i + 1}. ${wp.name} (type: ${wp.type}) (${wp.coordinates?.x.toFixed(1)}, ${wp.coordinates?.y.toFixed(1)})`);
      });
    }
    
    if (extractionLikePOIs.length > 0) {
      console.log(`\n   🔍 Found ${extractionLikePOIs.length} POIs with extraction/hatch-related names:`);
      extractionLikePOIs.forEach((poi, i) => {
        console.log(`      ${i + 1}. ${poi.name} (type: ${poi.type}) (${poi.coordinates?.x.toFixed(1)}, ${poi.coordinates?.y.toFixed(1)})`);
      });
    }
    
    // Check all unique categories from raw API (if we can access it)
    // Look for anything that might be extraction-related in all POI names
    const allExtractionTerms = ['extraction', 'extract', 'exfil', 'hatch', 'departure', 'evac', 'exit', 'escape', 'helipad', 'landing', 'pickup', 'evacuation'];
    const allMatchingPOIs = pois.filter(poi => {
      const name = (poi.name || '').toLowerCase();
      return allExtractionTerms.some(term => name.includes(term));
    });
    
    if (allMatchingPOIs.length > extractionLikePOIs.length) {
      console.log(`\n   🔎 Found ${allMatchingPOIs.length} total POIs with any extraction-related terms:`);
      allMatchingPOIs.forEach((poi, i) => {
        console.log(`      ${i + 1}. ${poi.name} (type: ${poi.type}) (${poi.coordinates?.x.toFixed(1)}, ${poi.coordinates?.y.toFixed(1)})`);
      });
    }
    
    // Check all unique categories/types
    const allTypes = new Set();
    const allCategories = new Set();
    const allNames = new Set();
    
    waypoints.forEach(w => {
      allTypes.add(w.type);
      allNames.add(w.name?.toLowerCase() || '');
    });
    
    pois.forEach(p => {
      allTypes.add(p.type);
      allNames.add(p.name?.toLowerCase() || '');
    });
    
    console.log(`\n📊 Unique waypoint types: ${Array.from(allTypes).join(', ')}`);
    console.log(`\n🔤 Sample names (first 20):`);
    Array.from(allNames).slice(0, 20).forEach(name => {
      if (name.includes('extract') || name.includes('hatch') || name.includes('exfil')) {
        console.log(`   ⭐ ${name}`);
      }
    });
    
    console.log('\n─'.repeat(70));
    console.log('💡 If no extractions found, they may be in the raw API with different categories\n');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

const mapName = process.argv[2] || 'dam';
debugMapData(mapName);

