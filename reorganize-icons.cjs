const fs = require('fs');
const path = require('path');

// Logical grouping for pathfinding tool
const pathfindingGroups = {
  'spawn': {
    description: 'Player spawn points',
    includes: ['spawn', 'player_spawn']
  },
  'extraction': {
    description: 'Extraction points (hatches, elevators, lifts)',
    includes: ['extraction', 'hatch', 'metro_station', 'metro_entrance']
  },
  'loot-containers': {
    description: 'Loot containers (caches, crates, cases)',
    includes: ['cache', 'base_container', 'breachable_container', 'utility_crate', 
               'weapon_case', 'field_crate', 'ammo_crate', 'med_crate', 'raider_cache',
               'locker', 'bag', 'basket', 'box', 'car']
  },
  'locked-rooms': {
    description: 'Locked rooms requiring keys',
    includes: ['locked_room', 'security_breach']
  },
  'enemies-arcs': {
    description: 'ARC enemies and husks',
    includes: ['arc', 'arc_courier', 'arc_husk', 'arc_probe', 'baron_husk', 
               'tick', 'wasp', 'sentinel', 'bison', 'pop', 'rollbot', 'turret',
               'queen', 'bastion', 'rocketeer', 'fireball', 'hornet', 'bombardier',
               'matriarch', 'harvester', 'bees']
  },
  'objectives': {
    description: 'Quest objectives and interactive items',
    includes: ['a-balanced-harvest', 'water-troubles', 'source-of-the-contamination',
               'untended-garden', 'our-presence-up-there', 'flickering-threat',
               'straight-record', 'greasing-her-palms', 'broken-monument',
               'echoes-of-victory-ridge', 'keeping-the-memory', 'a-symbol-of-unification',
               'the-majors-footlocker', 'celestes-journals', 'dormant-barons',
               'eyes-in-the-sky', 'back-on-top', 'snitch', 'a-new-type-of-plant',
               'security_breach', 'medical-merchandise', 'prescriptions-of-the-past',
               'turnabout', 'a-lay-of-the-land', 'lost-in-transmission', 'power-out',
               'fuel-cell', 'bunker', 'antenna', 'button', 'building-a-library',
               'the-root-of-the-matter', 'digging-up-dirt', 'communication-hideout',
               'after-rain-comes', 'market-correction', 'eyes-on-the-prize',
               'esr-analyzer', 'marked-for-death', 'industrial-espionage',
               'unexpected-initiative', 'a-warm-place-to-rest', 'life-of-a-pharmacist',
               'espresso', 'a-first-foothold', 'with-a-trace', 'reduced-to-rubble',
               'armored-transports', 'switching-the-supply', 'what-we-left-behind']
  },
  'resources-plants': {
    description: 'Harvestable plants and resources',
    includes: ['prickly-pear', 'apricot', 'agave', 'mushroom', 'great-mullein',
               'lemons', 'olive', 'moss', 'fertilizer', 'roots']
  },
  'supply-stations': {
    description: 'Supply stations and depots',
    includes: ['supply_station', 'field_depot', 'raider_camp']
  },
  'other': {
    description: 'Other miscellaneous items',
    includes: ['other']
  }
};

function reorganizeIcons() {
  const iconsDir = path.join(__dirname, 'icons');
  const reorganizedDir = path.join(__dirname, 'icons-pathfinding');
  
  if (!fs.existsSync(iconsDir)) {
    console.error('❌ Icons directory not found!');
    return;
  }
  
  // Create new organized directory
  if (!fs.existsSync(reorganizedDir)) {
    fs.mkdirSync(reorganizedDir, { recursive: true });
  }
  
  // Read all existing folders
  const existingFolders = fs.readdirSync(iconsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  console.log('📁 Reorganizing icons for pathfinding tool...\n');
  
  // Create new organized structure
  for (const [groupName, groupInfo] of Object.entries(pathfindingGroups)) {
    const groupDir = path.join(reorganizedDir, groupName);
    if (!fs.existsSync(groupDir)) {
      fs.mkdirSync(groupDir, { recursive: true });
    }
    
    // Create README for this group
    const readmePath = path.join(groupDir, 'README.txt');
    fs.writeFileSync(readmePath, `${groupInfo.description}\n\nThis folder contains icons for: ${groupInfo.includes.join(', ')}\n`, 'utf8');
    
    // Collect all icon names from matching folders
    const allIconNames = new Set();
    
    for (const folderName of existingFolders) {
      // Check if this folder matches any of the includes
      const matches = groupInfo.includes.some(include => {
        // Check if folder name contains the include or vice versa
        return folderName.toLowerCase().includes(include.toLowerCase()) ||
               include.toLowerCase().includes(folderName.toLowerCase());
      });
      
      if (matches) {
        const iconNamesPath = path.join(iconsDir, folderName, 'icon-names.txt');
        if (fs.existsSync(iconNamesPath)) {
          const content = fs.readFileSync(iconNamesPath, 'utf8');
          const iconNames = content.split('\n')
            .map(line => line.trim())
            .filter(line => line && line.endsWith('.png'));
          
          iconNames.forEach(name => allIconNames.add(name));
        }
      }
    }
    
    // Write consolidated icon names file
    if (allIconNames.size > 0) {
      const iconNamesArray = Array.from(allIconNames).sort();
      const iconNamesPath = path.join(groupDir, 'icon-names.txt');
      fs.writeFileSync(iconNamesPath, iconNamesArray.join('\n'), 'utf8');
      
      console.log(`✅ ${groupName}/`);
      console.log(`   ${groupInfo.description}`);
      console.log(`   ${iconNamesArray.length} icon(s) needed`);
      console.log(`   Examples: ${iconNamesArray.slice(0, 3).join(', ')}${iconNamesArray.length > 3 ? '...' : ''}\n`);
    }
  }
  
  // Also create a summary file
  const summaryPath = path.join(reorganizedDir, 'SUMMARY.txt');
  let summary = 'ICON ORGANIZATION FOR PATHFINDING TOOL\n';
  summary += '='.repeat(70) + '\n\n';
  summary += 'Icons are organized by functional groups that make sense for pathfinding:\n\n';
  
  for (const [groupName, groupInfo] of Object.entries(pathfindingGroups)) {
    const groupDir = path.join(reorganizedDir, groupName);
    const iconNamesPath = path.join(groupDir, 'icon-names.txt');
    if (fs.existsSync(iconNamesPath)) {
      const content = fs.readFileSync(iconNamesPath, 'utf8');
      const count = content.split('\n').filter(line => line.trim()).length;
      summary += `${groupName.toUpperCase()}/\n`;
      summary += `  ${groupInfo.description}\n`;
      summary += `  ${count} icon(s)\n\n`;
    }
  }
  
  fs.writeFileSync(summaryPath, summary, 'utf8');
  
  console.log('='.repeat(70));
  console.log('✨ Reorganization complete!');
  console.log(`📂 New structure: ${reorganizedDir}`);
  console.log('='.repeat(70));
}

reorganizeIcons();

