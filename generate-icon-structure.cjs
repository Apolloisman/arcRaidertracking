const fs = require('fs');
const path = require('path');
const { createArcRaidersClient } = require('./dist/arc-raiders/client.js');

async function generateIconStructure() {
  const client = createArcRaidersClient({ usePersistentCache: true });
  
  const maps = ['dam', 'spaceport', 'buried-city', 'blue-gate'];
  const iconsDir = path.join(__dirname, 'icons');
  
  // Create main icons directory
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }
  
  // Track all subcategories and their icon names across all maps
  const subcategoryMap = new Map(); // subcategory -> Set of icon names
  
  for (const mapName of maps) {
    try {
      console.log(`\n📋 Processing ${mapName.toUpperCase()}...`);
      const mapData = await client.getMapData(mapName);
      
      // Process waypoints
      if (mapData.waypoints) {
        mapData.waypoints.forEach(wp => {
          if (wp.name) {
            // Use the waypoint type as subcategory, or 'waypoint' as default
            const subcategory = wp.type || 'waypoint';
            if (!subcategoryMap.has(subcategory)) {
              subcategoryMap.set(subcategory, new Set());
            }
            // Clean the name for filename (remove special chars, spaces)
            const iconName = wp.name
              .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename chars
              .trim();
            if (iconName) {
              subcategoryMap.get(subcategory).add(iconName);
            }
          }
        });
      }
      
      // Process POIs - use subcategory from API if available
      // We need to get the raw API data to see subcategories
      // For now, use the POI type
      if (mapData.pois) {
        mapData.pois.forEach(poi => {
          const subcategory = poi.type || 'poi';
          if (!subcategoryMap.has(subcategory)) {
            subcategoryMap.set(subcategory, new Set());
          }
          const iconName = poi.name
            .replace(/[<>:"/\\|?*]/g, '')
            .trim();
          if (iconName) {
            subcategoryMap.get(subcategory).add(iconName);
          }
        });
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${mapName}:`, error.message);
    }
  }
  
  // Now we need to get the actual subcategories from the API
  // Let's make a direct API call to get subcategories
  const https = require('https');
  
  for (const mapName of maps) {
    try {
      const url = `https://metaforge.app/api/game-map-data?tableID=arc_map_data&mapID=${mapName}`;
      
      await new Promise((resolve, reject) => {
        https.get(url, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              if (response.allData) {
                response.allData.forEach(item => {
                  const subcategory = (item.subcategory || item.category || 'other').toLowerCase().trim();
                  if (!subcategoryMap.has(subcategory)) {
                    subcategoryMap.set(subcategory, new Set());
                  }
                  
                  // Use instanceName if available, otherwise subcategory or category
                  const iconName = (item.instanceName || item.subcategory || item.category || 'unknown')
                    .replace(/[<>:"/\\|?*]/g, '')
                    .trim();
                  
                  if (iconName && iconName !== 'null') {
                    subcategoryMap.get(subcategory).add(iconName);
                  }
                });
              }
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        }).on('error', reject);
      });
    } catch (error) {
      console.error(`Error fetching raw API data for ${mapName}:`, error.message);
    }
  }
  
  // Create folders and .txt files
  console.log(`\n${'='.repeat(70)}`);
  console.log('📁 Creating icon folder structure...');
  console.log('='.repeat(70));
  
  let totalIcons = 0;
  
  for (const [subcategory, iconNames] of subcategoryMap.entries()) {
    // Clean subcategory name for folder name
    const folderName = subcategory
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    
    if (!folderName || folderName === 'null') continue;
    
    const folderPath = path.join(iconsDir, folderName);
    
    // Create folder
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`\n✅ Created folder: ${folderName}/`);
    }
    
    // Create .txt file with icon names
    const iconNamesArray = Array.from(iconNames).sort();
    const txtContent = iconNamesArray
      .filter(name => name && name !== 'null')
      .map(name => `${name}.png`)
      .join('\n');
    
    if (txtContent) {
      const txtPath = path.join(folderPath, 'icon-names.txt');
      fs.writeFileSync(txtPath, txtContent, 'utf8');
      console.log(`   📄 Created icon-names.txt with ${iconNamesArray.length} icon(s)`);
      totalIcons += iconNamesArray.length;
      
      // Show first few names as examples
      if (iconNamesArray.length > 0) {
        const examples = iconNamesArray.slice(0, 5).join(', ');
        const more = iconNamesArray.length > 5 ? ` (+${iconNamesArray.length - 5} more)` : '';
        console.log(`   📝 Examples: ${examples}${more}`);
      }
    }
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`✨ Complete! Created ${subcategoryMap.size} folders with ${totalIcons} total icon names`);
  console.log(`📂 Icons directory: ${iconsDir}`);
  console.log('='.repeat(70));
}

generateIconStructure().catch(console.error);

