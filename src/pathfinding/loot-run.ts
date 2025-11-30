import type { MapData, PointOfInterest, Waypoint, Coordinates, ArcMission } from '../arc-raiders/types';

export interface LootRunPath {
  mapId: string;
  mapName: string;
  waypoints: PathWaypoint[];
  totalDistance: number;
  estimatedTime?: number; // in seconds
}

export interface PathWaypoint {
  id: string;
  name: string;
  coordinates: Coordinates;
  type: 'spawn' | 'cache' | 'extraction' | 'raider-key' | 'arc' | 'other';
  order: number;
  instruction?: string; // Human-readable instruction for this step
  distanceToExtraction?: number; // Distance to nearest extraction point
  isNearExtraction?: boolean; // Whether this point is near extraction
  dangerLevel?: 'low' | 'medium' | 'high' | 'extreme'; // Danger assessment
  dangerReasons?: string[]; // Why this area is dangerous
  arcDifficulty?: 'easy' | 'medium' | 'hard' | 'extreme'; // ARC difficulty if applicable
  arrivalTime?: number; // Time in seconds from start when you reach this point
  playerInterceptionRisk?: PlayerInterceptionRisk; // Risk of other players intercepting
}

export interface PlayerInterceptionRisk {
  canIntercept: boolean;
  firstPossibleContact?: {
    waypointIndex: number;
    waypointName: string;
    time: number; // Time in seconds when contact is possible
    otherPlayerSpawn: Coordinates;
    interceptionPoint: Coordinates;
  };
  lateSpawnWarnings?: Array<{
    spawnTime: number; // When late spawn occurs (16-20 min)
    yourLocation: {
      waypointIndex: number;
      waypointName: string;
      coordinates: Coordinates;
      time: number; // When you'll be here
    };
    theirPath: {
      distance: number;
      time: number; // How long it takes them to reach you
      firstWaypoint: Coordinates;
    };
  }>;
}

export interface LootRunOptions {
  startAtSpawn?: boolean;
  startAtCoordinates?: Coordinates; // Your actual spawn/current position
  endAtExtraction?: boolean;
  useRaiderKey?: boolean; // Prefer raider key extraction points
  maxCaches?: number;
  minRarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  algorithm?: 'nearest-neighbor' | 'greedy' | 'extraction-aware';
  extractionProximity?: number; // Max distance from extraction to loot (default: prioritize near extraction)
  maxTimeBeforeExtraction?: number; // Max seconds to loot before heading to extraction
  avoidDangerousAreas?: boolean; // Try to avoid objectives/known dangerous POIs
  dangerRadius?: number; // Radius to check for dangerous elements (default: 50 units)
  arcDangerWeight?: number; // How much multiple ARCs increase danger (default: 2.0)
  avoidPlayerInterception?: boolean; // Avoid paths that other players can intercept
  playerMovementSpeed?: number; // Units per second (default: 5)
  roundDuration?: number; // Total round duration in seconds (default: 1800 = 30 minutes)
  lateSpawnWindow?: { min: number; max: number }; // Late spawn time window in seconds (default: 960-1200 = 16-20 minutes)
}

/**
 * Calculate Euclidean distance between two 3D coordinates
 */
function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const dx = coord1.x - coord2.x;
  const dy = coord1.y - coord2.y;
  const dz = (coord1.z || 0) - (coord2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate total distance of a path
 */
function calculatePathDistance(waypoints: PathWaypoint[]): number {
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    total += calculateDistance(waypoints[i].coordinates, waypoints[i + 1].coordinates);
  }
  return total;
}

/**
 * Find the nearest unvisited point to a given point
 */
function findNearest(
  current: Coordinates,
  candidates: Array<{ coordinates: Coordinates; id: string; name: string; type: string }>,
  visited: Set<string>
): { coordinates: Coordinates; id: string; name: string; type: string } | null {
  let nearest: { coordinates: Coordinates; id: string; name: string; type: string } | null = null;
  let minDistance = Infinity;

  for (const candidate of candidates) {
    if (visited.has(candidate.id)) continue;
    
    const distance = calculateDistance(current, candidate.coordinates);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = candidate;
    }
  }

  return nearest;
}

/**
 * Calculate player interception risk for a path
 */
function calculatePlayerInterceptionRisk(
  path: PathWaypoint[],
  allSpawnPoints: Waypoint[],
  userSpawn: Coordinates,
  playerSpeed: number,
  roundDuration: number,
  lateSpawnWindow: { min: number; max: number }
): PlayerInterceptionRisk {
  const risk: PlayerInterceptionRisk = {
    canIntercept: false,
    lateSpawnWarnings: [],
  };

  // Calculate arrival times for each waypoint (reuse if already calculated)
  let currentTime = 0;
  const waypointsWithTime = path.map((wp, index) => {
    if (index > 0) {
      const distance = calculateDistance(path[index - 1].coordinates, wp.coordinates);
      currentTime += distance / playerSpeed;
    } else if (wp.arrivalTime !== undefined) {
      currentTime = wp.arrivalTime; // Use pre-calculated time if available
    }
    return { waypoint: wp, time: currentTime, index };
  });

  // Check early spawn interception (spawn at 0 minutes)
  // Other players spawn at same time, can they reach any point in our path before we do?
  if (allSpawnPoints.length === 0) {
    // No spawn points available - can't calculate interception
    risk.canIntercept = false;
    risk.lateSpawnWarnings = [];
    return risk;
  }
  
  for (const otherSpawn of allSpawnPoints) {
    if (!otherSpawn.coordinates) continue;
    
    // Skip if this is our spawn point
    const distToOurSpawn = calculateDistance(otherSpawn.coordinates, userSpawn);
    if (distToOurSpawn < 10) continue; // Same spawn point
    
    // Check each waypoint in our path
    for (const { waypoint, time: ourArrivalTime, index } of waypointsWithTime) {
      const distance = calculateDistance(otherSpawn.coordinates, waypoint.coordinates);
      const theirArrivalTime = distance / playerSpeed;
      
      // If they can reach this point before or at the same time as us, it's interceptable
      if (theirArrivalTime <= ourArrivalTime) {
        risk.canIntercept = true;
        if (!risk.firstPossibleContact || theirArrivalTime < risk.firstPossibleContact.time) {
          risk.firstPossibleContact = {
            waypointIndex: index,
            waypointName: waypoint.name,
            time: theirArrivalTime,
            otherPlayerSpawn: otherSpawn.coordinates,
            interceptionPoint: waypoint.coordinates,
          };
        }
      }
    }
  }

  // Check late spawn interception (spawn at 16-20 minutes)
  // Calculate where we'll be when late spawns occur
  const lateSpawnTimes = [
    lateSpawnWindow.min,
    (lateSpawnWindow.min + lateSpawnWindow.max) / 2,
    lateSpawnWindow.max,
  ];

  for (const spawnTime of lateSpawnTimes) {
    // Find where we'll be at this time
    let ourLocationAtSpawn: { waypoint: PathWaypoint; time: number; index: number } | null = null;
    for (const { waypoint, time, index } of waypointsWithTime) {
      if (time <= spawnTime) {
        ourLocationAtSpawn = { waypoint, time, index };
      } else {
        break;
      }
    }

    if (!ourLocationAtSpawn) continue;

    // Check each other spawn point
    for (const otherSpawn of allSpawnPoints) {
      if (!otherSpawn.coordinates) continue;
      
      const distToOurSpawn = calculateDistance(otherSpawn.coordinates, userSpawn);
      if (distToOurSpawn < 10) continue; // Same spawn point

      // Calculate their path to our current location
      const distanceToUs = calculateDistance(
        otherSpawn.coordinates,
        ourLocationAtSpawn.waypoint.coordinates
      );
      const timeToReachUs = distanceToUs / playerSpeed;

      // Find the first waypoint they'd likely go to (nearest cache or objective)
      // For now, use direct distance calculation
      risk.lateSpawnWarnings!.push({
        spawnTime,
        yourLocation: {
          waypointIndex: ourLocationAtSpawn.index,
          waypointName: ourLocationAtSpawn.waypoint.name,
          coordinates: ourLocationAtSpawn.waypoint.coordinates,
          time: ourLocationAtSpawn.time,
        },
        theirPath: {
          distance: distanceToUs,
          time: timeToReachUs,
          firstWaypoint: otherSpawn.coordinates,
        },
      });
    }
  }

  return risk;
}

/**
 * Calculate danger level for a location based on multiple factors
 */
interface DangerAssessment {
  level: 'low' | 'medium' | 'high' | 'extreme';
  score: number;
  reasons: string[];
}

function assessDanger(
  location: Coordinates,
  objectives: PointOfInterest[],
  arcs: ArcMission[],
  dangerRadius: number = 50,
  arcDangerWeight: number = 2.0
): DangerAssessment {
  const reasons: string[] = [];
  let score = 0;

  // Check for nearby objectives
  const nearbyObjectives = objectives.filter(obj => {
    if (!obj.coordinates) return false;
    return calculateDistance(location, obj.coordinates) <= dangerRadius;
  });
  
  if (nearbyObjectives.length > 0) {
    score += nearbyObjectives.length * 3;
    reasons.push(`${nearbyObjectives.length} objective${nearbyObjectives.length > 1 ? 's' : ''} nearby`);
  }

  // Check for nearby ARCs (multiple ARCs = more dangerous)
  const nearbyArcs: Array<{ arc: ArcMission; distance: number }> = [];
  arcs.forEach(arc => {
    // Try to match ARC location to coordinates if available
    // For now, we'll use a heuristic: if ARC has location string, check if it's near
    // In a real implementation, ARCs would have coordinates
    // This is a placeholder - you'd need to map ARC locations to coordinates
  });

  // Check for ARCs by name matching with POIs (if ARCs have location names)
  // Multiple ARCs in same area = high danger
  const arcCount = nearbyArcs.length;
  if (arcCount > 0) {
    const arcScore = arcCount * arcDangerWeight;
    score += arcScore;
    reasons.push(`${arcCount} ARC${arcCount > 1 ? 's' : ''} in area (${Math.round(arcScore)} danger)`);
  }

  // Check for high POI density (indicates buildings/structures = bad sight lines)
  // This is a proxy for "complex terrain" which is dangerous
  const allPOIs = [...objectives];
  const nearbyPOIs = allPOIs.filter(poi => {
    if (!poi.coordinates) return false;
    return calculateDistance(location, poi.coordinates) <= dangerRadius * 1.5;
  });
  
  if (nearbyPOIs.length >= 5) {
    score += 2;
    reasons.push(`High structure density (${nearbyPOIs.length} POIs) - poor sight lines`);
  }

  // Determine danger level
  let level: 'low' | 'medium' | 'high' | 'extreme';
  if (score >= 15) {
    level = 'extreme';
  } else if (score >= 8) {
    level = 'high';
  } else if (score >= 3) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return { level, score, reasons };
}

/**
 * Match ARCs to map POIs/objectives by location name
 * Returns ARCs with their matched coordinates
 */
function matchARCsToMap(
  arcs: ArcMission[],
  mapPOIs: PointOfInterest[],
  mapWaypoints: Waypoint[]
): Array<{ arc: ArcMission; coordinates: Coordinates; matchedPOI?: PointOfInterest | Waypoint }> {
  const matchedARCs: Array<{ arc: ArcMission; coordinates: Coordinates; matchedPOI?: PointOfInterest | Waypoint }> = [];
  
  arcs.forEach(arc => {
    if (!arc.location) return;
    
    const arcLocationLower = arc.location.toLowerCase();
    
    // Try to match ARC location to POI/waypoint by name
    // Check objectives first (ARCs are often at objectives)
    const matchedObjective = mapPOIs.find(poi => {
      if (!poi.coordinates) return false;
      const poiNameLower = poi.name.toLowerCase();
      return poiNameLower.includes(arcLocationLower) || 
             arcLocationLower.includes(poiNameLower) ||
             poiNameLower.includes(arc.name.toLowerCase()) ||
             arc.name.toLowerCase().includes(poiNameLower);
    });
    
    if (matchedObjective?.coordinates) {
      matchedARCs.push({
        arc,
        coordinates: matchedObjective.coordinates,
        matchedPOI: matchedObjective
      });
      return;
    }
    
    // Try matching to waypoints
    const matchedWaypoint = mapWaypoints.find(wp => {
      if (!wp.coordinates) return false;
      const wpNameLower = wp.name.toLowerCase();
      return wpNameLower.includes(arcLocationLower) || 
             arcLocationLower.includes(wpNameLower) ||
             wpNameLower.includes(arc.name.toLowerCase()) ||
             arc.name.toLowerCase().includes(wpNameLower);
    });
    
    if (matchedWaypoint?.coordinates) {
      matchedARCs.push({
        arc,
        coordinates: matchedWaypoint.coordinates,
        matchedPOI: matchedWaypoint
      });
    }
  });
  
  return matchedARCs;
}

/**
 * Find nearest extraction point (including raider key points)
 */
function findNearestExtraction(
  point: Coordinates,
  extractionPoints: Waypoint[],
  useRaiderKey: boolean = false
): { point: Coordinates; distance: number; isRaiderKey: boolean } | null {
  if (extractionPoints.length === 0) return null;

  let nearest: { point: Coordinates; distance: number; isRaiderKey: boolean } | null = null;
  let minDistance = Infinity;

  for (const ext of extractionPoints) {
    if (!ext.coordinates) continue;
    
    // Check if this is a raider key extraction (by name or type)
    const isRaiderKey = ext.name.toLowerCase().includes('raider') || 
                        ext.name.toLowerCase().includes('key') ||
                        ext.type === 'other'; // Some extraction points might be marked as 'other'
    
    // If useRaiderKey is true, prefer raider key points
    if (useRaiderKey && !isRaiderKey) continue;
    
    const distance = calculateDistance(point, ext.coordinates);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = { point: ext.coordinates, distance, isRaiderKey };
    }
  }

  return nearest;
}

/**
 * Generate extraction-aware path that prioritizes staying near extraction
 */
function generateExtractionAwarePath(
  spawnPoints: Waypoint[],
  cachePOIs: PointOfInterest[],
  extractionPoints: Waypoint[],
  dangerousPOIs: PointOfInterest[],
  arcs: ArcMission[],
  options: LootRunOptions,
  allSpawnPoints?: Waypoint[] // All spawn points for player avoidance
): PathWaypoint[] {
  const path: PathWaypoint[] = [];
  const visited = new Set<string>();
  const visitedARCs = new Set<string>();
  let currentOrder = 0;
  
  // Match ARCs to map locations
  const allWaypoints = [...spawnPoints, ...extractionPoints];
  const matchedARCs = matchARCsToMap(arcs, dangerousPOIs, allWaypoints);
  
  // Player avoidance settings
  const avoidInterception = options.avoidPlayerInterception ?? true;
  const playerSpeed = options.playerMovementSpeed ?? 5; // units per second
  const roundDuration = options.roundDuration ?? 1800; // 30 minutes
  const lateSpawnWindow = options.lateSpawnWindow ?? { min: 960, max: 1200 }; // 16-20 minutes

  // Get primary extraction point (prefer raider key if requested)
  const useRaiderKey = options.useRaiderKey || false;
  let primaryExtraction: Coordinates | null = null;
  let primaryExtractionIsRaiderKey = false;
  
  // Find best extraction point
  if (spawnPoints.length > 0 && spawnPoints[0].coordinates) {
    const nearestExt = findNearestExtraction(spawnPoints[0].coordinates, extractionPoints, useRaiderKey);
    if (nearestExt) {
      primaryExtraction = nearestExt.point;
      primaryExtractionIsRaiderKey = nearestExt.isRaiderKey;
    }
  } else if (extractionPoints.length > 0) {
    const ext = extractionPoints.find(ep => {
      if (!ep.coordinates) return false;
      if (useRaiderKey) {
        return ep.name.toLowerCase().includes('raider') || ep.name.toLowerCase().includes('key');
      }
      return true;
    }) || extractionPoints[0];
    
    if (ext?.coordinates) {
      primaryExtraction = ext.coordinates;
      primaryExtractionIsRaiderKey = ext.name.toLowerCase().includes('raider') || 
                                      ext.name.toLowerCase().includes('key');
    }
  }
  
  if (!primaryExtraction) {
    // Fallback to nearest-neighbor if no extraction
    return generateNearestNeighborPath(spawnPoints, cachePOIs, extractionPoints, options);
  }

  // Calculate safe distance from extraction (default: 30% of map size or 100 units)
  const extractionProximity = options.extractionProximity || 100;
  const dangerRadius = options.dangerRadius || 50;
  const arcDangerWeight = options.arcDangerWeight || 2.0;
  
  // Create dangerous area set with enhanced danger assessment
  const dangerousCoords = new Map<string, DangerAssessment>();
  if (options.avoidDangerousAreas) {
    // Pre-assess danger for all POIs
    dangerousPOIs.forEach(poi => {
      if (poi.coordinates) {
        const key = `${poi.coordinates.x},${poi.coordinates.y}`;
        if (!dangerousCoords.has(key)) {
          const assessment = assessDanger(poi.coordinates, dangerousPOIs, arcs, dangerRadius, arcDangerWeight);
          dangerousCoords.set(key, assessment);
        }
      }
    });
  }

  // Start at user's actual position or spawn point
  let currentPoint: Coordinates | null = null;
  
  if (options.startAtCoordinates) {
    // Use user's actual coordinates
    const distToExt = calculateDistance(options.startAtCoordinates, primaryExtraction);
    path.push({
      id: 'user-spawn',
      name: 'Your Position',
      coordinates: options.startAtCoordinates,
      type: 'spawn',
      order: currentOrder++,
      instruction: `Start from your current position`,
      distanceToExtraction: distToExt,
      isNearExtraction: distToExt <= extractionProximity,
    });
    currentPoint = options.startAtCoordinates;
  } else if (options.startAtSpawn && spawnPoints.length > 0) {
    // Use first spawn point (or could find nearest to a reference point)
    const spawn = spawnPoints[0];
    
    if (spawn.coordinates) {
      const distToExt = calculateDistance(spawn.coordinates, primaryExtraction);
      path.push({
        id: spawn.id,
        name: spawn.name,
        coordinates: spawn.coordinates,
        type: 'spawn',
        order: currentOrder++,
        instruction: `Start at spawn point: ${spawn.name} (NOTE: Use --spawn-x/y/z if you spawned elsewhere)`,
        distanceToExtraction: distToExt,
        isNearExtraction: distToExt <= extractionProximity,
      });
      visited.add(spawn.id);
      currentPoint = spawn.coordinates;
    }
  }

  // Prepare cache candidates with extraction distance and danger assessment
  const cacheCandidates = cachePOIs
    .filter(poi => poi.coordinates)
    .map(poi => {
      const coords = poi.coordinates!;
      const distToExt = calculateDistance(coords, primaryExtraction);
      const key = `${coords.x},${coords.y}`;
      const dangerInfo = dangerousCoords.get(key);
      const isDangerous = dangerInfo ? dangerInfo.level !== 'low' : false;
      const dangerLevel = dangerInfo?.level || 'low';
      const dangerReasons = dangerInfo?.reasons || [];
      
      return {
        coordinates: coords,
        id: poi.id,
        name: poi.name,
        type: 'cache' as const,
        distanceToExtraction: distToExt,
        isNearExtraction: distToExt <= extractionProximity,
        isDangerous,
        dangerLevel,
        dangerReasons,
        dangerScore: dangerInfo?.score || 0,
      };
    });

  // Prepare ARC candidates with extraction distance and danger assessment
  const arcCandidates = matchedARCs
    .filter(matched => !visitedARCs.has(matched.arc.id))
    .map(matched => {
      const coords = matched.coordinates;
      const distToExt = calculateDistance(coords, primaryExtraction);
      const key = `${coords.x},${coords.y}`;
      const dangerInfo = dangerousCoords.get(key);
      const isDangerous = dangerInfo ? dangerInfo.level !== 'high' && dangerInfo.level !== 'extreme' : false; // ARCs are inherently dangerous, but we want safer ones
      const dangerLevel = dangerInfo?.level || 'medium'; // ARCs default to medium danger
      const dangerReasons = dangerInfo?.reasons || [];
      const arcDifficulty = matched.arc.difficulty || 'medium';
      
      return {
        coordinates: coords,
        id: `arc-${matched.arc.id}`,
        name: matched.arc.name,
        arc: matched.arc,
        type: 'arc' as const,
        distanceToExtraction: distToExt,
        isNearExtraction: distToExt <= extractionProximity * 1.5, // ARCs can be slightly further from extraction
        isDangerous,
        dangerLevel,
        dangerReasons,
        dangerScore: dangerInfo?.score || 5, // ARCs have base danger score
        arcDifficulty,
      };
    });

  // Combine and sort all candidates (caches + ARCs)
  // Prioritize: near extraction > not dangerous > ARCs for quests > lower danger score
  const allCandidates = [...cacheCandidates, ...arcCandidates].sort((a, b) => {
    // Prioritize: near extraction > not dangerous > lower danger score
    if (a.isNearExtraction !== b.isNearExtraction) {
      return a.isNearExtraction ? -1 : 1;
    }
    if (a.isDangerous !== b.isDangerous) {
      return a.isDangerous ? 1 : -1;
    }
    // Prefer ARCs slightly (for quest objectives) if both are safe and near extraction
    if (a.type === 'arc' && b.type === 'cache' && a.isNearExtraction && !a.isDangerous) {
      return -1;
    }
    if (a.type === 'cache' && b.type === 'arc' && b.isNearExtraction && !b.isDangerous) {
      return 1;
    }
    if (a.dangerScore !== b.dangerScore) {
      return a.dangerScore - b.dangerScore;
    }
    return a.distanceToExtraction - b.distanceToExtraction;
  });

  // Phase 1: Get near extraction quickly (first 2-3 caches should be near extraction)
  const maxCaches = options.maxCaches || Math.min(15, cacheCandidates.length);
  let cachesVisited = 0;
  let timeSpent = 0;
  const averageSpeed = 5; // units per second

  // If starting far from extraction, prioritize getting closer first
  if (currentPoint) {
    const spawnDistToExt = calculateDistance(currentPoint, primaryExtraction);
    if (spawnDistToExt > extractionProximity * 1.5) {
      // Find nearest cache to extraction to get into safe zone
      const nearestToExt = cacheCandidates
        .filter(c => !visited.has(c.id) && c.isNearExtraction)
        .sort((a, b) => a.distanceToExtraction - b.distanceToExtraction)[0];
      
      if (nearestToExt && currentPoint) {
        const prevPoint = currentPoint;
        path.push({
          id: nearestToExt.id,
          name: nearestToExt.name,
          coordinates: nearestToExt.coordinates,
          type: 'cache',
          order: currentOrder++,
          instruction: `Head to ${nearestToExt.name} (near extraction zone)`,
          distanceToExtraction: nearestToExt.distanceToExtraction,
          isNearExtraction: true,
        });
        visited.add(nearestToExt.id);
        timeSpent += calculateDistance(prevPoint, nearestToExt.coordinates) / averageSpeed;
        currentPoint = nearestToExt.coordinates;
        cachesVisited++;
      }
    }
  }

  // Phase 2: Loot caches and kill ARCs near extraction (prioritize these)
  // Total path: spawn (1) + loot locations (maxCaches) + extraction (1) = maxCaches + 2
  // We want exactly maxCaches loot locations between spawn and extraction
  let targetsVisited = 0; // Count both caches and ARCs
  const maxTargets = maxCaches; // Exactly maxCaches loot locations (can include ARCs for quests)
  
  while (targetsVisited < maxTargets) {
    // Check if we should head to extraction soon
    const maxTime = options.maxTimeBeforeExtraction || 300; // 5 minutes default
    const distToExt = currentPoint ? calculateDistance(currentPoint, primaryExtraction) : Infinity;
    const timeToExt = distToExt / averageSpeed;

    // If we're running out of time or far from extraction, prioritize near-extraction targets
    const shouldPrioritizeExtraction = timeSpent + timeToExt > maxTime * 0.7 || distToExt > extractionProximity * 2;

    // Find next target (cache or ARC)
    let nextTarget = null;
    
    if (shouldPrioritizeExtraction) {
      // Only consider targets very close to extraction and not dangerous
      nextTarget = allCandidates
        .filter(c => {
          if (c.type === 'arc') {
            return !visitedARCs.has(c.id) && c.isNearExtraction && !c.isDangerous;
          }
          return !visited.has(c.id) && c.isNearExtraction && !c.isDangerous;
        })
        .sort((a, b) => {
          const distA = currentPoint ? calculateDistance(currentPoint, a.coordinates) : Infinity;
          const distB = currentPoint ? calculateDistance(currentPoint, b.coordinates) : Infinity;
          return distA - distB;
        })[0];
    } else {
      // Normal priority: near extraction first, then others
      // Prefer ARCs if they're safe and near extraction (for quest objectives)
      nextTarget = allCandidates
        .filter(c => {
          if (c.type === 'arc') {
            return !visitedARCs.has(c.id) && !c.isDangerous;
          }
          return !visited.has(c.id) && !c.isDangerous;
        })
        .sort((a, b) => {
          const distA = currentPoint ? calculateDistance(currentPoint, a.coordinates) : Infinity;
          const distB = currentPoint ? calculateDistance(currentPoint, b.coordinates) : Infinity;
          
          // Prefer near-extraction targets
          if (a.isNearExtraction !== b.isNearExtraction) {
            return a.isNearExtraction ? -1 : 1;
          }
          // Prefer ARCs slightly if both are safe and near extraction (for quests)
          if (a.type === 'arc' && b.type === 'cache' && a.isNearExtraction && !a.isDangerous) {
            return -1;
          }
          if (a.type === 'cache' && b.type === 'arc' && b.isNearExtraction && !b.isDangerous) {
            return 1;
          }
          return distA - distB;
        })[0];
    }

    if (!nextTarget) break;

    const travelTime = currentPoint ? calculateDistance(currentPoint, nextTarget.coordinates) / averageSpeed : 0;
    timeSpent += travelTime;

    // Build instruction with danger info
    let instruction = '';
    if (nextTarget.type === 'arc') {
      const arcDifficulty = 'arcDifficulty' in nextTarget ? nextTarget.arcDifficulty : 'medium';
      instruction = `Kill ARC: ${nextTarget.name} (${arcDifficulty} difficulty)`;
      if (nextTarget.isNearExtraction) {
        instruction += ' (safe zone - near extraction)';
      } else {
        instruction += ` (${Math.round(nextTarget.distanceToExtraction)} units from extraction)`;
      }
    } else {
      instruction = `Loot ${nextTarget.name}`;
      if (nextTarget.isNearExtraction) {
        instruction += ' (safe zone - near extraction)';
      } else {
        instruction += ` (${Math.round(nextTarget.distanceToExtraction)} units from extraction)`;
      }
    }
    
    if (nextTarget.dangerLevel !== 'low' && nextTarget.dangerReasons.length > 0) {
      instruction += ` ⚠️ ${nextTarget.dangerLevel.toUpperCase()}: ${nextTarget.dangerReasons.join(', ')}`;
    }

    const waypoint: PathWaypoint = {
      id: nextTarget.id,
      name: nextTarget.name,
      coordinates: nextTarget.coordinates,
      type: nextTarget.type,
      order: currentOrder++,
      instruction,
      distanceToExtraction: nextTarget.distanceToExtraction,
      isNearExtraction: nextTarget.isNearExtraction,
      dangerLevel: nextTarget.dangerLevel,
      dangerReasons: nextTarget.dangerReasons,
    };

    if (nextTarget.type === 'arc' && 'arcDifficulty' in nextTarget) {
      waypoint.arcDifficulty = nextTarget.arcDifficulty;
    }

    path.push(waypoint);
    
    if (nextTarget.type === 'arc') {
      visitedARCs.add(nextTarget.id);
    } else {
      visited.add(nextTarget.id);
    }
    
    currentPoint = nextTarget.coordinates;
    targetsVisited++;

    // If we've spent too much time, stop and head to extraction
    if (timeSpent > maxTime * 0.8) {
      break;
    }
  }

  // End at extraction
  if (options.endAtExtraction && primaryExtraction) {
    const extraction = extractionPoints.find(ep => 
      ep.coordinates && 
      calculateDistance(ep.coordinates, primaryExtraction) < 1
    ) || extractionPoints[0];

    if (extraction?.coordinates) {
      const extractionType = primaryExtractionIsRaiderKey ? 'raider-key' : 'extraction';
      const extractionName = extraction.name + (primaryExtractionIsRaiderKey ? ' (Raider Key)' : '');
      
      path.push({
        id: extraction.id,
        name: extraction.name,
        coordinates: extraction.coordinates,
        type: extractionType,
        order: currentOrder++,
        instruction: `Extract at ${extractionName}`,
        distanceToExtraction: 0,
        isNearExtraction: true,
        dangerLevel: 'low',
      });
    }
  }

  // Calculate arrival times and player interception risks
  if (avoidInterception && allSpawnPoints && allSpawnPoints.length > 0 && path.length > 0) {
    const userSpawn = options.startAtCoordinates || (spawnPoints[0]?.coordinates);
    if (userSpawn) {
      // Calculate arrival times
      let currentTime = 0;
      for (let i = 0; i < path.length; i++) {
        if (i > 0) {
          const distance = calculateDistance(path[i - 1].coordinates, path[i].coordinates);
          currentTime += distance / playerSpeed;
        }
        path[i].arrivalTime = currentTime;
      }

      // Calculate interception risk for the entire path
      const interceptionRisk = calculatePlayerInterceptionRisk(
        path,
        allSpawnPoints,
        userSpawn,
        playerSpeed,
        roundDuration,
        lateSpawnWindow
      );

      // Always add interception risk to first waypoint (even if safe, so we can show the analysis)
      path[0].playerInterceptionRisk = interceptionRisk;
    }
  }

  return path;
}

/**
 * Generate a loot run path using nearest-neighbor algorithm
 */
function generateNearestNeighborPath(
  spawnPoints: Waypoint[],
  cachePOIs: PointOfInterest[],
  extractionPoints: Waypoint[],
  options: LootRunOptions
): PathWaypoint[] {
  const path: PathWaypoint[] = [];
  const visited = new Set<string>();

  // Start at user's actual position or spawn point
  let currentPoint: Coordinates | null = null;
  let currentOrder = 0;

  if (options.startAtCoordinates) {
    // Use user's actual coordinates
    const primaryExtraction = extractionPoints.find(ep => ep.coordinates)?.coordinates;
    const distToExt = primaryExtraction ? calculateDistance(options.startAtCoordinates, primaryExtraction) : undefined;
    
    path.push({
      id: 'user-spawn',
      name: 'Your Position',
      coordinates: options.startAtCoordinates,
      type: 'spawn',
      order: currentOrder++,
      instruction: `Start from your current position`,
      distanceToExtraction: distToExt,
      isNearExtraction: distToExt ? distToExt <= 100 : undefined,
    });
    currentPoint = options.startAtCoordinates;
  } else if (options.startAtSpawn && spawnPoints.length > 0) {
    const spawn = spawnPoints[0];
    if (spawn.coordinates) {
      const primaryExtraction = extractionPoints.find(ep => ep.coordinates)?.coordinates;
      const distToExt = primaryExtraction ? calculateDistance(spawn.coordinates, primaryExtraction) : undefined;
      
      path.push({
        id: spawn.id,
        name: spawn.name,
        coordinates: spawn.coordinates,
        type: 'spawn',
        order: currentOrder++,
        instruction: `Start at spawn point: ${spawn.name}`,
        distanceToExtraction: distToExt,
        isNearExtraction: distToExt ? distToExt <= 100 : undefined,
      });
      visited.add(spawn.id);
      currentPoint = spawn.coordinates;
    }
  }

  // Convert cache POIs to a format we can work with
  const cacheCandidates = cachePOIs
    .filter(poi => poi.coordinates)
    .map(poi => ({
      coordinates: poi.coordinates!,
      id: poi.id,
      name: poi.name,
      type: 'cache' as const,
    }));

  // Limit number of caches if specified
  const maxCaches = options.maxCaches || cacheCandidates.length;
  const cachesToVisit = cacheCandidates.slice(0, maxCaches);

  // If no spawn point, start at first cache
  if (!currentPoint && cachesToVisit.length > 0) {
    const firstCache = cachesToVisit[0];
    const primaryExtraction = extractionPoints.find(ep => ep.coordinates)?.coordinates;
    const distToExt = primaryExtraction ? calculateDistance(firstCache.coordinates, primaryExtraction) : undefined;
    
    path.push({
      id: firstCache.id,
      name: firstCache.name,
      coordinates: firstCache.coordinates,
      type: 'cache',
      order: currentOrder++,
      instruction: `Loot ${firstCache.name}`,
      distanceToExtraction: distToExt,
      isNearExtraction: distToExt ? distToExt <= 100 : undefined,
    });
    visited.add(firstCache.id);
    currentPoint = firstCache.coordinates;
  }

  // Visit caches using nearest-neighbor
  const primaryExtraction = extractionPoints.find(ep => ep.coordinates)?.coordinates;
  
  while (visited.size < cachesToVisit.length && path.length < maxCaches) {
    const nearest = findNearest(currentPoint!, cachesToVisit, visited);
    if (!nearest) break;

    const distToExt = primaryExtraction ? calculateDistance(nearest.coordinates, primaryExtraction) : undefined;

    path.push({
      id: nearest.id,
      name: nearest.name,
      coordinates: nearest.coordinates,
      type: 'cache',
      order: currentOrder++,
      instruction: `Loot ${nearest.name}`,
      distanceToExtraction: distToExt,
      isNearExtraction: distToExt ? distToExt <= 100 : undefined,
    });
    visited.add(nearest.id);
    currentPoint = nearest.coordinates;
  }

  // End at extraction point if available
  if (options.endAtExtraction && extractionPoints.length > 0) {
    const extraction = extractionPoints[0];
    if (extraction.coordinates) {
      path.push({
        id: extraction.id,
        name: extraction.name,
        coordinates: extraction.coordinates,
        type: 'extraction',
        order: currentOrder++,
        instruction: `Extract at ${extraction.name}`,
        distanceToExtraction: 0,
        isNearExtraction: true,
      });
    }
  }

  return path;
}

/**
 * Generate a loot run path for a given map
 */
export function generateLootRun(
  mapData: MapData,
  options: LootRunOptions = {},
  arcs: ArcMission[] = []
): LootRunPath | null {
  if (!mapData.waypoints && !mapData.pois) {
    return null;
  }

  // Extract spawn points
  const spawnPoints = (mapData.waypoints || []).filter(
    wp => wp.type === 'spawn' && wp.coordinates
  );

  // Extract extraction points
  const extractionPoints = (mapData.waypoints || []).filter(
    wp => wp.type === 'extraction' && wp.coordinates
  );

  // Extract cache POIs (loot locations)
  const cachePOIs = (mapData.pois || []).filter(
    poi => poi.type === 'cache' && poi.coordinates
  );

  if (cachePOIs.length === 0) {
    return null; // No loot caches found on this map
  }

  // Extract dangerous POIs (objectives, etc. - areas to potentially avoid)
  const dangerousPOIs = (mapData.pois || []).filter(
    poi => poi.type === 'objective' && poi.coordinates
  );

  // Generate path based on algorithm
  const algorithm = options.algorithm || 'extraction-aware';
  let waypoints: PathWaypoint[] = [];

  switch (algorithm) {
    case 'extraction-aware':
      waypoints = generateExtractionAwarePath(
        spawnPoints, 
        cachePOIs, 
        extractionPoints, 
        dangerousPOIs,
        arcs,
        options,
        spawnPoints // Pass all spawn points for player avoidance
      );
      break;
    case 'nearest-neighbor':
    case 'greedy':
      waypoints = generateNearestNeighborPath(spawnPoints, cachePOIs, extractionPoints, options);
      break;
    default:
      // Default to extraction-aware algorithm
      waypoints = generateExtractionAwarePath(
        spawnPoints, 
        cachePOIs, 
        extractionPoints, 
        dangerousPOIs,
        arcs,
        options,
        spawnPoints // Pass all spawn points for player avoidance
      );
  }

  if (waypoints.length === 0) {
    return null;
  }

  const totalDistance = calculatePathDistance(waypoints);
  
  // Estimate time (assuming average movement speed, can be customized)
  const averageSpeed = 5; // units per second (adjust based on game mechanics)
  const estimatedTime = totalDistance / averageSpeed;

  return {
    mapId: mapData.id,
    mapName: mapData.name,
    waypoints,
    totalDistance,
    estimatedTime,
  };
}

/**
 * Generate loot run paths for all available maps
 */
export async function generateLootRunsForAllMaps(
  getMaps: () => Promise<MapData[]>,
  options: LootRunOptions = {},
  getArcs?: () => Promise<ArcMission[]>
): Promise<LootRunPath[]> {
  const maps = await getMaps();
  const paths: LootRunPath[] = [];
  
  // Fetch ARCs once if needed
  let arcs: ArcMission[] = [];
  if (options.avoidDangerousAreas && getArcs) {
    try {
      arcs = await getArcs();
    } catch (error) {
      // Continue without ARCs if fetch fails
    }
  }

  for (const map of maps) {
    // Filter ARCs for this specific map
    const mapArcs = arcs.filter(arc => {
      const arcLocation = arc.location?.toLowerCase() || '';
      const mapNameLower = map.name.toLowerCase();
      return arcLocation.includes(mapNameLower) || 
             mapNameLower.includes(arcLocation) ||
             arcLocation === '';
    });
    
    const path = generateLootRun(map, options, mapArcs);
    if (path) {
      paths.push(path);
    }
  }

  return paths;
}

/**
 * Format path as a readable string with step-by-step instructions
 */
export function formatLootRunPath(path: LootRunPath): string {
  let output = `\n╔═══════════════════════════════════════════════════════════╗\n`;
  output += `║  LOOT RUN: ${path.mapName.toUpperCase().padEnd(40)}║\n`;
  output += `╚═══════════════════════════════════════════════════════════╝\n\n`;
  
  output += `📊 STATS:\n`;
  output += `   • Total Distance: ${path.totalDistance.toFixed(2)} units\n`;
  if (path.estimatedTime) {
    const minutes = Math.floor(path.estimatedTime / 60);
    const seconds = Math.round(path.estimatedTime % 60);
    output += `   • Estimated Time: ${minutes}m ${seconds}s\n`;
  }
  output += `   • Waypoints: ${path.waypoints.length}\n\n`;

  // Check for player interception risks - always show analysis if available
  const firstWaypoint = path.waypoints[0];
  if (firstWaypoint?.playerInterceptionRisk) {
    const risk = firstWaypoint.playerInterceptionRisk;
    
    output += `⚠️  PLAYER INTERCEPTION ANALYSIS:\n`;
    output += `═══════════════════════════════════════════════════════════\n\n`;
    
    if (risk.canIntercept && risk.firstPossibleContact) {
      const contact = risk.firstPossibleContact;
      const contactMin = Math.floor(contact.time / 60);
      const contactSec = Math.round(contact.time % 60);
      output += `🔴 EARLY SPAWN INTERCEPTION RISK:\n`;
      output += `   ⚠️  Other players can intercept your path!\n`;
      output += `   First possible contact: ${contactMin}m ${contactSec}s\n`;
      output += `   Location: ${contact.waypointName} (Step ${contact.waypointIndex + 1})\n`;
      output += `   Their spawn: (${contact.otherPlayerSpawn.x.toFixed(1)}, ${contact.otherPlayerSpawn.y.toFixed(1)})\n`;
      output += `   Interception point: (${contact.interceptionPoint.x.toFixed(1)}, ${contact.interceptionPoint.y.toFixed(1)})\n\n`;
      output += `   💡 RECOMMENDATION: Consider adjusting your path to avoid this area\n`;
      output += `      or be prepared for potential player contact at this time.\n\n`;
    } else {
      output += `✅ EARLY SPAWN: Path is safe from early spawn interception\n`;
      output += `   Other players cannot reach any point in your path before you.\n`;
      output += `   Your path is optimized to avoid early spawn player contact.\n\n`;
    }
    
    // Show note if no spawn data available
    if (!risk.firstPossibleContact && (!risk.lateSpawnWarnings || risk.lateSpawnWarnings.length === 0)) {
      output += `ℹ️  Note: Spawn point data may be limited. Analysis based on available data.\n\n`;
    }
    
    if (risk.lateSpawnWarnings && risk.lateSpawnWarnings.length > 0) {
      output += `🟡 LATE SPAWN WARNINGS (16-20 minutes):\n`;
      for (const warning of risk.lateSpawnWarnings.slice(0, 3)) { // Show first 3
        const spawnMin = Math.floor(warning.spawnTime / 60);
        const spawnSec = Math.round(warning.spawnTime % 60);
        const yourMin = Math.floor(warning.yourLocation.time / 60);
        const yourSec = Math.round(warning.yourLocation.time % 60);
        const theirMin = Math.floor(warning.theirPath.time / 60);
        const theirSec = Math.round(warning.theirPath.time % 60);
        
        output += `\n   📍 Late spawn at ${spawnMin}m ${spawnSec}s:\n`;
        output += `      Your location: ${warning.yourLocation.waypointName} (Step ${warning.yourLocation.waypointIndex + 1})\n`;
        output += `      Your arrival time: ${yourMin}m ${yourSec}s\n`;
        output += `      Their distance to you: ${warning.theirPath.distance.toFixed(1)} units\n`;
        output += `      Their travel time: ${theirMin}m ${theirSec}s\n`;
        output += `      ⚠️  They could reach you by ${spawnMin + theirMin}m ${spawnSec + theirSec}s\n`;
      }
      output += `\n   💡 Be aware of late spawns and their potential paths to your location.\n\n`;
    }
    
    output += `═══════════════════════════════════════════════════════════\n\n`;
  }

  output += `🗺️  STEP-BY-STEP INSTRUCTIONS:\n`;
  output += `═══════════════════════════════════════════════════════════\n\n`;

  for (const waypoint of path.waypoints) {
    const coords = waypoint.coordinates;
    const stepNum = waypoint.order + 1;
    
    // Icon based on type
    let icon = '📍';
    if (waypoint.type === 'spawn') icon = '🚀';
    else if (waypoint.type === 'extraction') icon = '✈️';
    else if (waypoint.type === 'raider-key') icon = '🔑';
    else if (waypoint.type === 'cache') icon = '📦';
    else if (waypoint.type === 'arc') icon = '⚔️';
    
    // Safety indicator
    let safety = '';
    if (waypoint.isNearExtraction) {
      safety = ' 🟢 SAFE ZONE';
    } else if (waypoint.distanceToExtraction && waypoint.distanceToExtraction > 150) {
      safety = ' 🟡 FAR FROM EXTRACTION';
    }
    
    // Danger indicator
    let dangerIndicator = '';
    if (waypoint.dangerLevel) {
      if (waypoint.dangerLevel === 'extreme') dangerIndicator = ' 🔴 EXTREME DANGER';
      else if (waypoint.dangerLevel === 'high') dangerIndicator = ' 🟠 HIGH DANGER';
      else if (waypoint.dangerLevel === 'medium') dangerIndicator = ' 🟡 MEDIUM DANGER';
    }
    
    output += `${icon} STEP ${stepNum}: ${waypoint.instruction || waypoint.name}\n`;
    output += `   Location: ${waypoint.name}\n`;
    output += `   Coordinates: (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}${coords.z !== undefined ? `, ${coords.z.toFixed(1)}` : ''})\n`;
    
    if (waypoint.type === 'arc' && waypoint.arcDifficulty) {
      output += `   ARC Difficulty: ${waypoint.arcDifficulty.toUpperCase()} (Quest Objective)\n`;
    }
    
    if (waypoint.distanceToExtraction !== undefined) {
      output += `   Distance to extraction: ${waypoint.distanceToExtraction.toFixed(1)} units${safety}\n`;
    }
    
    if (waypoint.dangerLevel && waypoint.dangerLevel !== 'low') {
      output += `   Danger: ${waypoint.dangerLevel.toUpperCase()}${dangerIndicator}\n`;
      if (waypoint.dangerReasons && waypoint.dangerReasons.length > 0) {
        output += `   Reasons: ${waypoint.dangerReasons.join(', ')}\n`;
      }
    }
    
    output += `\n`;
  }

  output += `═══════════════════════════════════════════════════════════\n`;
  output += `💡 TIP: Stay near extraction zones when possible!\n`;
  output += `   If you see enemies or danger, head to extraction immediately.\n\n`;

  return output;
}

