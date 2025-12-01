const { createArcRaidersClient } = require('./dist/arc-raiders/client.js');

async function checkMapBounds() {
  const client = createArcRaidersClient({ usePersistentCache: true });
  
  const maps = ['dam', 'spaceport', 'buried-city', 'blue-gate'];
  
  for (const mapName of maps) {
    try {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Map: ${mapName.toUpperCase()}`);
      console.log('='.repeat(70));
      
      const mapData = await client.getMapData(mapName);
      
      // Collect all coordinates
      const allCoords = [];
      if (mapData.waypoints) {
        mapData.waypoints.forEach(wp => {
          if (wp.coordinates) allCoords.push(wp.coordinates);
        });
      }
      if (mapData.pois) {
        mapData.pois.forEach(poi => {
          if (poi.coordinates) allCoords.push(poi.coordinates);
        });
      }
      
      if (allCoords.length === 0) {
        console.log('⚠️  No coordinates found');
        continue;
      }
      
      const xs = allCoords.map(c => c.x);
      const ys = allCoords.map(c => c.y);
      
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      
      const rangeX = maxX - minX;
      const rangeY = maxY - minY;
      const aspectRatio = rangeX / rangeY;
      
      console.log(`\n📊 Coordinate Ranges:`);
      console.log(`   X (longitude): ${minX.toFixed(2)} to ${maxX.toFixed(2)} (range: ${rangeX.toFixed(2)})`);
      console.log(`   Y (latitude):  ${minY.toFixed(2)} to ${maxY.toFixed(2)} (range: ${rangeY.toFixed(2)})`);
      console.log(`   Aspect Ratio:  ${aspectRatio.toFixed(3)}:1 (${(aspectRatio * 100).toFixed(1)}% wider than tall)`);
      
      // Calculate recommended image dimensions
      // Use a base height and calculate width to maintain aspect ratio
      const baseHeight = 1200; // Recommended base height
      const recommendedWidth = Math.round(baseHeight * aspectRatio);
      
      console.log(`\n🖼️  Recommended Map Image Dimensions:`);
      console.log(`   Width:  ${recommendedWidth}px`);
      console.log(`   Height: ${baseHeight}px`);
      console.log(`   Or maintain aspect ratio: ${aspectRatio.toFixed(3)}:1`);
      
      // Show some sample coordinates
      console.log(`\n📍 Sample Coordinates:`);
      console.log(`   Spawn points: ${mapData.waypoints?.filter(w => w.type === 'spawn').length || 0}`);
      console.log(`   Extraction points: ${mapData.waypoints?.filter(w => w.type === 'extraction').length || 0}`);
      console.log(`   Total waypoints: ${mapData.waypoints?.length || 0}`);
      console.log(`   Total POIs: ${mapData.pois?.length || 0}`);
      
    } catch (error) {
      console.error(`❌ Error checking ${mapName}:`, error.message);
    }
  }
}

checkMapBounds().catch(console.error);

