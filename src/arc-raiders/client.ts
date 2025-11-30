import { ApiClient, createApiClient } from '../client';
import { Cache } from '../cache';
import { PersistentCache } from '../persistent-cache';
import type {
  ArcRaidersItem,
  Weapon,
  Armor,
  Quest,
  ArcMission,
  MapData,
  Trader,
  TraderItem,
  ArcRaidersFilter,
  ArcRaidersApiResponse,
  PointOfInterest,
  Waypoint,
  Coordinates,
} from './types';
import {
  generateLootRun,
  generateLootRunsForAllMaps,
  formatLootRunPath,
  type LootRunPath,
  type LootRunOptions,
} from '../pathfinding/loot-run';

export interface ArcRaidersClientConfig {
  baseURL?: string;
  apiKey?: string;
  timeout?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  usePersistentCache?: boolean; // Use file-based persistent cache (default: true)
  cacheFilePath?: string; // Custom cache file path
}

export class ArcRaidersClient {
  private readonly client: ApiClient;
  private readonly cache: Cache | PersistentCache;
  protected readonly baseURL = 'https://metaforge.app/api/arc-raiders';
  private readonly defaultTimeout = 10000;
  private readonly cacheEnabled: boolean;

  constructor(config?: ArcRaidersClientConfig) {
    this.client = createApiClient({
      baseURL: config?.baseURL || this.baseURL,
      defaultHeaders: {
        'Content-Type': 'application/json',
        ...(config?.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
      },
      timeout: config?.timeout || this.defaultTimeout,
    });
    this.cacheEnabled = config?.cacheEnabled !== false;
    // Default to 7 days (168 hours) - very aggressive caching to minimize API calls
    // Map data rarely changes, so we can cache it for a long time
    // Set to 0 for no expiration (cache forever until manually cleared)
    const cacheTTL = config?.cacheTTL !== undefined 
      ? config.cacheTTL 
      : 7 * 24 * 60 * 60 * 1000; // 7 days default
    
    // Use persistent cache by default (saves to disk, persists across runs)
    const usePersistentCache = config?.usePersistentCache !== false;
    if (usePersistentCache) {
      this.cache = new PersistentCache(cacheTTL, config?.cacheFilePath);
    } else {
      this.cache = new Cache(cacheTTL);
    }
  }

  private getCacheKey(endpoint: string, params?: ArcRaidersFilter | Record<string, any>): string {
    const paramString = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
    return `${endpoint}:${paramString}`;
  }

  clearCache(): void {
    this.cache.clear();
  }

  protected buildQueryParams(filter?: ArcRaidersFilter): Record<string, string | number> {
    const params: Record<string, string | number> = {};

    if (filter?.rarity) {
      const normalizeRarity = (rarity: string): string => {
        const lower = rarity.toLowerCase();
        const rarityMap: Record<string, string> = {
          'common': 'Common',
          'uncommon': 'Uncommon',
          'rare': 'Rare',
          'epic': 'Epic',
          'legendary': 'Legendary'
        };
        return rarityMap[lower] || rarity;
      };

      if (Array.isArray(filter.rarity)) {
        params.rarity = filter.rarity.map(normalizeRarity).join(',');
      } else {
        params.rarity = normalizeRarity(filter.rarity);
      }
    }

    if (filter?.type) {
      params.type = Array.isArray(filter.type)
        ? filter.type.join(',')
        : filter.type;
    }

    if (filter?.difficulty) {
      params.difficulty = Array.isArray(filter.difficulty)
        ? filter.difficulty.join(',')
        : filter.difficulty;
    }

    if (filter?.search) {
      params.search = filter.search;
    }

    if (filter?.page !== undefined) {
      params.page = filter.page;
    }

    if (filter?.pageSize !== undefined) {
      params.pageSize = filter.pageSize;
    }

    return params;
  }

  async getItems(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<ArcRaidersItem[]> {
    const cacheKey = this.getCacheKey('/items', filter);
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<ArcRaidersItem[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const allItems: ArcRaidersItem[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filter, page, pageSize: 50 });
      const response = await this.client.get<ArcRaidersApiResponse<ArcRaidersItem[]>>(
        '/items',
        { params }
      );
      
      allItems.push(...response.data.data);
      hasMore = response.data.pagination?.hasNextPage || false;
      page++;
    }

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, allItems);
    }

    return allItems;
  }

  async getItemById(id: string): Promise<ArcRaidersItem> {
    const cacheKey = this.getCacheKey(`/items/${id}`);
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<ArcRaidersItem>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const response = await this.client.get<ArcRaidersItem>(`/items/${id}`);
    
    if (this.cacheEnabled) {
      this.cache.set(cacheKey, response.data);
    }

    return response.data;
  }

  async getWeapons(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Weapon[]> {
    const filterWithType = { ...filter, type: 'weapon' as const };
    const cacheKey = this.getCacheKey('/items', { ...filterWithType, type: 'weapon' });
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<Weapon[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const allWeapons: Weapon[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filterWithType, page, pageSize: 50 });
      const response = await this.client.get<ArcRaidersApiResponse<Weapon[]>>(
        '/items',
        { params }
      );
      
      allWeapons.push(...response.data.data);
      hasMore = response.data.pagination?.hasNextPage || false;
      page++;
    }

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, allWeapons);
    }

    return allWeapons;
  }

  async getWeaponById(id: string): Promise<Weapon> {
    const item = await this.getItemById(id);
    return item as Weapon;
  }

  async getArmor(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Armor[]> {
    const filterWithType = { ...filter, type: 'armor' as const };
    const cacheKey = this.getCacheKey('/items', { ...filterWithType, type: 'armor' });
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<Armor[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const allArmor: Armor[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filterWithType, page, pageSize: 50 });
      const response = await this.client.get<ArcRaidersApiResponse<Armor[]>>(
        '/items',
        { params }
      );
      
      allArmor.push(...response.data.data);
      hasMore = response.data.pagination?.hasNextPage || false;
      page++;
    }

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, allArmor);
    }

    return allArmor;
  }

  async getArmorById(id: string): Promise<Armor> {
    const item = await this.getItemById(id);
    return item as Armor;
  }

  async getQuests(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Quest[]> {
    const cacheKey = this.getCacheKey('/quests', filter);
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<Quest[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const allQuests: Quest[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filter, page, pageSize: 50 });
      const response = await this.client.get<ArcRaidersApiResponse<Quest[]>>(
        '/quests',
        { params }
      );
      
      allQuests.push(...response.data.data);
      hasMore = response.data.pagination?.hasNextPage || false;
      page++;
    }

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, allQuests);
    }

    return allQuests;
  }

  async getQuestById(id: string): Promise<Quest> {
    const response = await this.client.get<Quest>(`/quests/${id}`);
    return response.data;
  }

  async getARCs(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<ArcMission[]> {
    const cacheKey = this.getCacheKey('/arcs', filter);
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<ArcMission[]>(cacheKey);
      if (cached) {
        // Cache hit - no API call needed
        return cached;
      }
    }
    
    // Cache miss - API call required

    const allARCs: ArcMission[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = this.buildQueryParams({ ...filter, page, pageSize: 50 });
      const response = await this.client.get<ArcRaidersApiResponse<ArcMission[]>>(
        '/arcs',
        { params }
      );
      
      allARCs.push(...response.data.data);
      hasMore = response.data.pagination?.hasNextPage || false;
      page++;
    }

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, allARCs);
    }

    return allARCs;
  }

  async getARCById(id: string): Promise<ArcMission> {
    const response = await this.client.get<ArcMission>(`/arcs/${id}`);
    return response.data;
  }

  async getMapData(mapName: string): Promise<MapData> {
    const normalizedMapName = mapName.toLowerCase().replace(/\s+/g, '-');
    const cacheKey = this.getCacheKey('/game-map-data', { tableID: 'arc_map_data', mapID: normalizedMapName });
    
    // Check cache first
    if (this.cacheEnabled) {
      const cached = this.cache.get<MapData>(cacheKey);
      if (cached) {
        return cached;
      }
    }
    
    const mapClient = createApiClient({
      baseURL: 'https://metaforge.app/api',
      defaultHeaders: {
        'Content-Type': 'application/json',
      },
      timeout: this.client['defaultTimeout'] || this.defaultTimeout,
    });
    
    // API requires both tableID and mapID parameters
    // Response format: { allData: Array<{lat, lng, category, subcategory, ...}> }
    const response = await mapClient.get<{ allData: Array<{
      id: string;
      lat: number;
      lng: number;
      zlayers?: number;
      mapID: string;
      category: string;
      subcategory: string;
      instanceName?: string | null;
    }> }>('/game-map-data', {
      params: { 
        tableID: 'arc_map_data',
        mapID: normalizedMapName 
      },
    });
    
    // Transform API response to MapData format
    const apiData = response.data.allData || [];
    
    // Map categories to POI types
    const categoryToPOIType: Record<string, 'cache' | 'spawn' | 'extraction' | 'objective' | 'vendor' | 'other'> = {
      'containers': 'cache',
      'spawn': 'spawn',
      'extraction': 'extraction',
      'objective': 'objective',
      'vendor': 'vendor',
    };
    
    // Convert API data to POIs and waypoints
    const pois: PointOfInterest[] = [];
    const waypoints: Waypoint[] = [];
    
    apiData.forEach(item => {
      let poiType = categoryToPOIType[item.category] || 'other';
      const coords: Coordinates = {
        x: item.lng, // API uses lng for x
        y: item.lat, // API uses lat for y
        z: item.zlayers !== undefined && item.zlayers !== 2147483647 ? item.zlayers : undefined,
      };
      
      // Check if this is a player spawn (can be in instanceName or subcategory)
      const instanceName = (item.instanceName || '').toLowerCase();
      const subcategory = (item.subcategory || '').toLowerCase();
      const isPlayerSpawn = instanceName.includes('spawn') || 
                           subcategory.includes('spawn') ||
                           item.category === 'spawn';
      
      // Check if this is an extraction point or hatch (can be in instanceName, subcategory, or category)
      const isExtraction = instanceName.includes('extraction') ||
                          instanceName.includes('extract') ||
                          instanceName.includes('exfil') ||
                          instanceName.includes('hatch') ||
                          instanceName.includes('departure') ||
                          instanceName.includes('evac') ||
                          instanceName.includes('evacuation') ||
                          subcategory.includes('extraction') ||
                          subcategory.includes('extract') ||
                          subcategory.includes('exfil') ||
                          subcategory.includes('hatch') ||
                          subcategory.includes('departure') ||
                          subcategory.includes('evac') ||
                          item.category === 'extraction' ||
                          item.category === 'hatch' ||
                          item.category === 'departure' ||
                          item.category?.toLowerCase().includes('extraction') ||
                          item.category?.toLowerCase().includes('hatch') ||
                          item.category?.toLowerCase().includes('departure');
      
      if (isPlayerSpawn) {
        poiType = 'spawn';
      } else if (isExtraction) {
        poiType = 'extraction';
      }
      
      if (poiType === 'spawn' || poiType === 'extraction') {
        waypoints.push({
          id: item.id,
          name: item.instanceName || item.subcategory || item.category,
          coordinates: coords,
          type: poiType,
        });
      } else {
        pois.push({
          id: item.id,
          name: item.instanceName || item.subcategory || item.category,
          type: poiType,
          coordinates: coords,
        });
      }
    });
    
    // Scan POIs for extraction points and hatches that weren't caught in initial categorization
    // These might be stored as type 'other' with hatch/extraction in the name
    const extractionPOIs: Waypoint[] = [];
    const remainingPOIs: PointOfInterest[] = [];
    
    pois.forEach(poi => {
      const poiName = (poi.name || '').toLowerCase();
      const isHatchOrExtraction = poiName.includes('hatch') ||
                                  poiName.includes('extraction') ||
                                  poiName.includes('extract') ||
                                  poiName.includes('exfil') ||
                                  poiName.includes('departure') ||
                                  poiName.includes('evac') ||
                                  poiName.includes('evacuation') ||
                                  poiName.includes('exit') ||
                                  poiName.includes('escape') ||
                                  poiName.includes('helipad') ||
                                  poiName.includes('landing') ||
                                  poiName.includes('pickup');
      
      if (isHatchOrExtraction && poi.coordinates) {
        // Convert to extraction waypoint
        extractionPOIs.push({
          id: poi.id,
          name: poi.name || 'extraction',
          coordinates: poi.coordinates,
          type: 'extraction',
        });
      } else {
        remainingPOIs.push(poi);
      }
    });
    
    // Add extraction POIs to waypoints
    if (extractionPOIs.length > 0) {
      waypoints.push(...extractionPOIs);
    }
    
    // Name spawn points based on nearby landmarks
    const namedWaypoints = waypoints.map(wp => {
      if (wp.type === 'spawn' && wp.coordinates) {
        // Find nearest landmark/POI to give spawn a meaningful name
        const spawnCoords = wp.coordinates;
        let nearestLandmark: { name: string; distance: number } | null = null;
        const searchRadius = 200; // Search within 200 units for nearby landmarks
        
        // Search in POIs for nearby landmarks
        // Import calculateDistance logic inline (Euclidean distance in 2D)
        for (const poi of remainingPOIs) {
          if (poi.coordinates && poi.name && poi.type !== 'cache') {
            const dx = poi.coordinates.x - spawnCoords.x;
            const dy = poi.coordinates.y - spawnCoords.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= searchRadius && (!nearestLandmark || distance < nearestLandmark.distance)) {
              nearestLandmark = { name: poi.name, distance };
            }
          }
        }
        
        // If we found a nearby landmark, use it to name the spawn
        if (nearestLandmark && nearestLandmark.distance < 150) {
          const baseName = wp.name || 'player_spawn';
          // Only rename if current name is generic
          if (baseName.toLowerCase().includes('spawn') || baseName.toLowerCase() === 'player_spawn') {
            wp.name = `Near ${nearestLandmark.name}`;
          }
        }
      }
      return wp;
    });
    
    const mapData: MapData = {
      id: normalizedMapName,
      name: normalizedMapName,
      waypoints: namedWaypoints,
      pois: remainingPOIs,
    };
    
    // Cache the result
    if (this.cacheEnabled) {
      this.cache.set(cacheKey, mapData);
    }
    
    return mapData;
  }

  async getMaps(): Promise<MapData[]> {
    const mapNames = ['dam', 'spaceport', 'buried-city', 'blue-gate'];
    const mapData = await Promise.all(
      mapNames.map(map => this.getMapData(map).catch(() => null))
    );
    return mapData.filter((map): map is MapData => map !== null);
  }

  async getTraders(): Promise<Record<string, TraderItem[]>> {
    const cacheKey = this.getCacheKey('/traders');
    
    if (this.cacheEnabled) {
      const cached = this.cache.get<Record<string, TraderItem[]>>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const response = await this.client.get<{ success: boolean; data: Record<string, TraderItem[]> }>('/traders');
    const data = response.data.data || {};
    
    if (this.cacheEnabled) {
      this.cache.set(cacheKey, data);
    }

    return data;
  }

  async getTraderById(id: string): Promise<Trader> {
    const response = await this.client.get<Trader>(`/traders/${id}`);
    return response.data;
  }

  async search(query: string, filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<{
    items?: ArcRaidersItem[];
    quests?: Quest[];
    arcs?: ArcMission[];
    traders?: Trader[];
  }> {
    const searchFilter = { ...filter, search: query };
    const items = await this.getItems(searchFilter);
    
    return {
      items,
    };
  }

  async getAllItems(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<ArcRaidersItem[]> {
    return this.getItems(filter);
  }

  async getAllWeapons(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Weapon[]> {
    return this.getWeapons(filter);
  }

  async getAllArmor(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Armor[]> {
    return this.getArmor(filter);
  }

  async getAllQuests(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Quest[]> {
    return this.getQuests(filter);
  }

  async getAllARCs(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<ArcMission[]> {
    return this.getARCs(filter);
  }

  /**
   * Generate a loot run path for a specific map
   * @param mapName - Name of the map (e.g., 'dam', 'spaceport', 'buried-city', 'blue-gate')
   * @param options - Options for path generation
   * @returns A loot run path with optimized waypoints, or null if no path can be generated
   */
  async generateLootRunForMap(
    mapName: string,
    options: LootRunOptions = {}
  ): Promise<LootRunPath | null> {
    const mapData = await this.getMapData(mapName);
    
    // Fetch ARCs for path inclusion and danger assessment
    let arcs: ArcMission[] = [];
    try {
      arcs = await this.getARCs();
      // Filter ARCs that might be on this map (by location name matching)
      arcs = arcs.filter(arc => {
        const arcLocation = arc.location?.toLowerCase() || '';
        const mapNameLower = mapName.toLowerCase();
        return arcLocation.includes(mapNameLower) || 
               mapNameLower.includes(arcLocation) ||
               arcLocation === ''; // Include ARCs with no location as they might be anywhere
      });
    } catch (error) {
      // If ARC fetching fails, continue without them
      console.warn('Could not fetch ARCs:', error);
    }
    
    // Create enhanced options with ARCs
    const enhancedOptions = { ...options };
    
    return generateLootRun(mapData, enhancedOptions, arcs);
  }

  /**
   * Generate loot run paths for all available maps
   * @param options - Options for path generation
   * @returns Array of loot run paths for all maps
   */
  async generateLootRunsForAllMaps(
    options: LootRunOptions = {}
  ): Promise<LootRunPath[]> {
    return generateLootRunsForAllMaps(
      () => this.getMaps(), 
      options,
      options.avoidDangerousAreas ? () => this.getARCs() : undefined
    );
  }

  /**
   * Format a loot run path as a readable string
   * @param path - The loot run path to format
   * @returns Formatted string representation of the path
   */
  formatLootRunPath(path: LootRunPath): string {
    return formatLootRunPath(path);
  }
}

export function createArcRaidersClient(config?: ArcRaidersClientConfig): ArcRaidersClient {
  return new ArcRaidersClient(config);
}
