#!/usr/bin/env node

/**
 * Test script to directly check extraction point detection
 */

const { createArcRaidersClient } = require('./dist/index.js');

async function testExtractions(mapName) {
  try {
    const client = createArcRaidersClient();
    
    // Disable cache temporarily to force fresh API call
    const testClient = createArcRaidersClient({ cacheEnabled: false });
    const mapData = await testClient.getMapData(mapName);
    
    console.log(`\n🔍 Testing extraction detection for: ${mapName}`);
    console.log('─'.repeat(70));
    
    const waypoints = mapData.waypoints || [];
    const pois = mapData.pois || [];
    
    console.log(`\n📌 Waypoints: ${waypoints.length}`);
    const extractions = waypoints.filter(w => w.type === 'extraction');
    console.log(`   Extractions in waypoints: ${extractions.length}`);
    
    if (extractions.length > 0) {
      console.log('\n   ✅ EXTRACTION WAYPOINTS FOUND:');
      extractions.forEach((ext, i) => {
        console.log(`      ${i + 1}. ${ext.name} (${ext.coordinates.x.toFixed(1)}, ${ext.coordinates.y.toFixed(1)})`);
      });
    }
    
    console.log(`\n📦 POIs: ${pois.length}`);
    const hatchPOIs = pois.filter(p => {
      const name = (p.name || '').toLowerCase();
      return name.includes('hatch') || name.includes('extraction') || name.includes('extract');
    });
    console.log(`   Hatches/extractions in POIs: ${hatchPOIs.length}`);
    
    if (hatchPOIs.length > 0) {
      console.log('\n   ⚠️  Hatches/extractions still in POIs (should be converted):');
      hatchPOIs.forEach((poi, i) => {
        console.log(`      ${i + 1}. ${poi.name} (type: ${poi.type}) (${poi.coordinates?.x.toFixed(1)}, ${poi.coordinates?.y.toFixed(1)})`);
      });
    }
    
    console.log('\n─'.repeat(70));
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

const mapName = process.argv[2] || 'dam';
testExtractions(mapName);


