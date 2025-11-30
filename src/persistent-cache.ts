import * as fs from 'fs';
import * as path from 'path';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface CacheFile {
  entries: Record<string, CacheEntry<unknown>>;
  version: number;
}

export class PersistentCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultTTL: number;
  private cacheFilePath: string;

  constructor(defaultTTL: number = 5 * 60 * 1000, cacheFilePath?: string) {
    this.defaultTTL = defaultTTL;
    // Default cache file location: .cache/arc-raiders-cache.json
    // Use script directory if available, otherwise fall back to process.cwd()
    const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    this.cacheFilePath = cacheFilePath || path.join(baseDir, '.cache', 'arc-raiders-cache.json');
    
    // Load cache from disk on initialization
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      // Ensure cache directory exists
      const cacheDir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
        return;
      }

      if (!fs.existsSync(this.cacheFilePath)) {
        return;
      }

      const fileContent = fs.readFileSync(this.cacheFilePath, 'utf-8');
      const cacheFile: CacheFile = JSON.parse(fileContent);
      
      const now = Date.now();
      
      // Load entries and filter out expired ones
      for (const [key, entry] of Object.entries(cacheFile.entries)) {
        if (now - entry.timestamp <= entry.ttl) {
          this.cache.set(key, entry);
        }
      }
      
      // Save back to disk (removes expired entries)
      this.saveToDisk();
    } catch (error) {
      // If cache file is corrupted or can't be read, start fresh
      console.warn('Could not load cache from disk, starting fresh:', error);
    }
  }

  private saveToDisk(): void {
    try {
      // Ensure cache directory exists
      const cacheDir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const cacheFile: CacheFile = {
        version: 1,
        entries: {},
      };

      // Convert Map to object for JSON serialization
      for (const [key, entry] of this.cache.entries()) {
        cacheFile.entries[key] = entry;
      }

      fs.writeFileSync(this.cacheFilePath, JSON.stringify(cacheFile, null, 2), 'utf-8');
    } catch (error) {
      console.warn('Could not save cache to disk:', error);
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.saveToDisk(); // Remove expired entry from disk
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
    
    // Save to disk after setting
    this.saveToDisk();
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.saveToDisk();
  }

  clear(): void {
    this.cache.clear();
    this.saveToDisk();
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    const now = Date.now();
    // If TTL is 0, cache never expires (cache forever)
    if (entry.ttl > 0 && now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.saveToDisk();
      return false;
    }

    return true;
  }

  size(): number {
    return this.cache.size;
  }
}

