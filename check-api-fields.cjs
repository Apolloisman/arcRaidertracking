const { createArcRaidersClient } = require('./dist/arc-raiders/client.js');

async function checkAPIFields() {
  const client = createArcRaidersClient({ usePersistentCache: true });
  
  try {
    // Get map data
    const mapData = await client.getMapData('dam');
    
    // Check if we can access the raw API response
    // We need to make a direct API call to see all fields
    const https = require('https');
    const url = 'https://metaforge.app/api/game-map-data?tableID=arc_map_data&mapID=dam';
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.allData && response.allData.length > 0) {
            console.log('\n📋 All fields in API response (first item):');
            console.log('='.repeat(70));
            const firstItem = response.allData[0];
            console.log(JSON.stringify(firstItem, null, 2));
            
            console.log('\n🔍 Checking for icon/image fields:');
            const fields = Object.keys(firstItem);
            const iconFields = fields.filter(f => 
              f.toLowerCase().includes('icon') || 
              f.toLowerCase().includes('image') || 
              f.toLowerCase().includes('img') ||
              f.toLowerCase().includes('url') ||
              f.toLowerCase().includes('png') ||
              f.toLowerCase().includes('jpg') ||
              f.toLowerCase().includes('svg')
            );
            
            if (iconFields.length > 0) {
              console.log('✅ Found potential icon/image fields:', iconFields);
              iconFields.forEach(field => {
                console.log(`   ${field}: ${firstItem[field]}`);
              });
            } else {
              console.log('❌ No icon/image fields found in API response');
              console.log('\n📝 Available fields:', fields.join(', '));
            }
          }
        } catch (error) {
          console.error('Error parsing response:', error.message);
        }
      });
    }).on('error', (err) => {
      console.error('Error:', err.message);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAPIFields();

