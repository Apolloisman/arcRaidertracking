import { createArcRaidersClient } from '../src';

const arcRaiders = createArcRaidersClient({
  baseURL: 'https://metaforge.app/api/arc-raiders',
  timeout: 10000,
});

async function getItemsExample() {
  try {
    const response = await arcRaiders.getItems();
    console.log('Items:', response.data);

    const epicWeapons = await arcRaiders.getItems({
      rarity: 'epic',
      type: 'weapon',
      page: 1,
      pageSize: 20,
    });
    console.log('Epic Weapons:', epicWeapons.data);

    const item = await arcRaiders.getItemById('item-123');
    console.log('Item:', item);
  } catch (error) {
    console.error('Error fetching items:', error);
  }
}

async function getWeaponsExample() {
  try {
    const weapons = await arcRaiders.getWeapons({
      rarity: ['rare', 'epic', 'legendary'],
    });
    console.log('Weapons:', weapons.data);

    const weapon = await arcRaiders.getWeaponById('weapon-123');
    console.log('Weapon:', weapon);
  } catch (error) {
    console.error('Error fetching weapons:', error);
  }
}

async function getArmorExample() {
  try {
    const armor = await arcRaiders.getArmor({
      rarity: 'legendary',
    });
    console.log('Armor:', armor.data);

    const chestArmor = await arcRaiders.getArmorById('armor-123');
    console.log('Armor:', chestArmor);
  } catch (error) {
    console.error('Error fetching armor:', error);
  }
}

async function getQuestsExample() {
  try {
    const quests = await arcRaiders.getQuests({
      difficulty: 'hard',
      page: 1,
      pageSize: 10,
    });
    console.log('Quests:', quests.data);

    const quest = await arcRaiders.getQuestById('quest-123');
    console.log('Quest:', quest);
  } catch (error) {
    console.error('Error fetching quests:', error);
  }
}

async function getARCsExample() {
  try {
    const arcs = await arcRaiders.getARCs();
    console.log('ARCs:', arcs.data);

    const arc = await arcRaiders.getARCById('arc-123');
    console.log('ARC:', arc);
  } catch (error) {
    console.error('Error fetching ARCs:', error);
  }
}

async function getMapsExample() {
  try {
    const damMap = await arcRaiders.getMapData('dam');
    console.log('Dam Map:', damMap);

    const maps = await arcRaiders.getMaps();
    console.log('All Maps:', maps);
  } catch (error) {
    console.error('Error fetching maps:', error);
  }
}

async function getTradersExample() {
  try {
    const traders = await arcRaiders.getTraders();
    console.log('Traders:', traders.data);

    const trader = await arcRaiders.getTraderById('trader-123');
    console.log('Trader:', trader);
  } catch (error) {
    console.error('Error fetching traders:', error);
  }
}

async function searchExample() {
  try {
    const results = await arcRaiders.search('sniper', {
      page: 1,
      pageSize: 10,
    });
    console.log('Search Results:', results);
  } catch (error) {
    console.error('Error searching:', error);
  }
}

async function main() {
  console.log('=== Arc Raiders API Client Examples ===\n');

  await getItemsExample();
  await getWeaponsExample();
  await getArmorExample();
  await getQuestsExample();
  await getARCsExample();
  await getMapsExample();
  await getTradersExample();
  await searchExample();
}

if (require.main === module) {
  main().catch(console.error);
}

export {
  getItemsExample,
  getWeaponsExample,
  getArmorExample,
  getQuestsExample,
  getARCsExample,
  getMapsExample,
  getTradersExample,
  searchExample,
};
