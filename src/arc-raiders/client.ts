import { ApiClient, createApiClient } from '../client';
import type { ApiResponse } from '../types';
import type {
  ArcRaidersItem,
  Weapon,
  Armor,
  Quest,
  ARC,
  ArcMission,
  Location,
  MapData,
  Trader,
  TraderItem,
  ArcRaidersFilter,
  ArcRaidersApiResponse,
} from './types';

export interface ArcRaidersClientConfig {
  baseURL?: string;
  apiKey?: string;
  timeout?: number;
}

export class ArcRaidersClient {
  private client: ApiClient;
  private baseURL = 'https://metaforge.app/api/arc-raiders';
  private readonly defaultTimeout = 10000;

  constructor(config?: ArcRaidersClientConfig) {
    this.client = createApiClient({
      baseURL: config?.baseURL || this.baseURL,
      defaultHeaders: {
        'Content-Type': 'application/json',
        ...(config?.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
      },
      timeout: config?.timeout || this.defaultTimeout,
    });
  }

  private buildQueryParams(filter?: ArcRaidersFilter): Record<string, string | number> {
    const params: Record<string, string | number> = {};

    if (filter?.rarity) {
      params.rarity = Array.isArray(filter.rarity) 
        ? filter.rarity.join(',') 
        : filter.rarity;
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

  async getItems(filter?: ArcRaidersFilter): Promise<ArcRaidersApiResponse<ArcRaidersItem[]>> {
    const response = await this.client.get<ArcRaidersApiResponse<ArcRaidersItem[]>>(
      '/items',
      { params: this.buildQueryParams(filter) }
    );
    return response.data;
  }

  async getItemById(id: string): Promise<ArcRaidersItem> {
    const response = await this.client.get<ArcRaidersItem>(`/items/${id}`);
    return response.data as ArcRaidersItem;
  }

  async getWeapons(filter?: ArcRaidersFilter): Promise<ArcRaidersApiResponse<Weapon[]>> {
    const filterWithType = { ...filter, type: 'weapon' as const };
    const response = await this.client.get<ArcRaidersApiResponse<Weapon[]>>(
      '/items',
      { params: this.buildQueryParams(filterWithType) }
    );
    return response.data;
  }

  async getWeaponById(id: string): Promise<Weapon> {
    const item = await this.getItemById(id);
    return item as Weapon;
  }

  async getArmor(filter?: ArcRaidersFilter): Promise<ArcRaidersApiResponse<Armor[]>> {
    const filterWithType = { ...filter, type: 'armor' as const };
    const response = await this.client.get<ArcRaidersApiResponse<Armor[]>>(
      '/items',
      { params: this.buildQueryParams(filterWithType) }
    );
    return response.data;
  }

  async getArmorById(id: string): Promise<Armor> {
    const item = await this.getItemById(id);
    return item as Armor;
  }

  async getQuests(filter?: ArcRaidersFilter): Promise<ArcRaidersApiResponse<Quest[]>> {
    const response = await this.client.get<ArcRaidersApiResponse<Quest[]>>(
      '/quests',
      { params: this.buildQueryParams(filter) }
    );
    return response.data;
  }

  async getQuestById(id: string): Promise<Quest> {
    const response = await this.client.get<Quest>(`/quests/${id}`);
    return response.data as Quest;
  }

  async getARCs(filter?: ArcRaidersFilter): Promise<ArcRaidersApiResponse<ArcMission[]>> {
    const response = await this.client.get<ArcRaidersApiResponse<ArcMission[]>>(
      '/arcs',
      { params: this.buildQueryParams(filter) }
    );
    return response.data;
  }

  async getARCById(id: string): Promise<ArcMission> {
    const response = await this.client.get<ArcMission>(`/arcs/${id}`);
    return response.data as ArcMission;
  }

  async getMapData(mapName: string): Promise<MapData> {
    const mapClient = createApiClient({
      baseURL: 'https://metaforge.app/api',
      defaultHeaders: {
        'Content-Type': 'application/json',
      },
      timeout: this.client['defaultTimeout'] || this.defaultTimeout,
    });
    
    const normalizedMapName = mapName.toLowerCase().replace(/\s+/g, '-');
    const response = await mapClient.get<MapData>('/game-map-data', {
      params: { map: normalizedMapName },
    });
    return response.data as MapData;
  }

  async getMaps(): Promise<MapData[]> {
    const mapNames = ['dam', 'spaceport', 'buried-city', 'blue-gate'];
    const mapData = await Promise.all(
      mapNames.map(map => this.getMapData(map).catch(() => null))
    );
    return mapData.filter((map): map is MapData => map !== null);
  }

  async getTraders(): Promise<Record<string, TraderItem[]>> {
    const response = await this.client.get<{ success: boolean; data: Record<string, TraderItem[]> }>('/traders');
    return response.data.data || {};
  }

  async getTraderById(id: string): Promise<Trader> {
    const response = await this.client.get<Trader>(`/traders/${id}`);
    return response.data as Trader;
  }

  async search(query: string, filter?: ArcRaidersFilter): Promise<{
    items?: ArcRaidersItem[];
    quests?: Quest[];
    arcs?: ArcMission[];
    traders?: Trader[];
  }> {
    const searchFilter = { ...filter, search: query };
    const items = await this.getItems(searchFilter);
    
    return {
      items: items.data,
    };
  }

  async getAllItems(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<ArcRaidersItem[]> {
    const allItems: ArcRaidersItem[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getItems({ ...filter, page, pageSize: 50 });
      allItems.push(...response.data);
      hasMore = response.pagination?.hasNextPage || false;
      page++;
    }

    return allItems;
  }

  async getAllWeapons(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Weapon[]> {
    const allWeapons: Weapon[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getWeapons({ ...filter, page, pageSize: 50 });
      allWeapons.push(...response.data);
      hasMore = response.pagination?.hasNextPage || false;
      page++;
    }

    return allWeapons;
  }

  async getAllArmor(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Armor[]> {
    const allArmor: Armor[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getArmor({ ...filter, page, pageSize: 50 });
      allArmor.push(...response.data);
      hasMore = response.pagination?.hasNextPage || false;
      page++;
    }

    return allArmor;
  }

  async getAllQuests(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<Quest[]> {
    const allQuests: Quest[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getQuests({ ...filter, page, pageSize: 50 });
      allQuests.push(...response.data);
      hasMore = response.pagination?.hasNextPage || false;
      page++;
    }

    return allQuests;
  }

  async getAllARCs(filter?: Omit<ArcRaidersFilter, 'page' | 'pageSize'>): Promise<ArcMission[]> {
    const allARCs: ArcMission[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getARCs({ ...filter, page, pageSize: 50 });
      allARCs.push(...response.data);
      hasMore = response.pagination?.hasNextPage || false;
      page++;
    }

    return allARCs;
  }
}

export function createArcRaidersClient(config?: ArcRaidersClientConfig): ArcRaidersClient {
  return new ArcRaidersClient(config);
}
