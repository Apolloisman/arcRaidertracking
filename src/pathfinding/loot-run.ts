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
  waitTime?: number; // Time in seconds to wait at this location
  waitReason?: string; // Reason for waiting
  fastestPlayerArrivalTime?: number; // Fastest possible arrival time from any spawn
  fastestPlayerSpawnName?: string; // Name of spawn with fastest arrival
  safeWindow?: number; // How long you have at this location before another player could arrive (in seconds)
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
  waypointSpawnAnalysis?: Array<{
    waypointIndex: number;
    waypointName: string;
    yourArrivalTime: number; // When you'll arrive at this waypoint
    closestSpawn: {
      coordinates: Coordinates;
      spawnName?: string;
      distance: number;
      theirArrivalTime: number; // When they could arrive if they ran directly here
      canBeatYou: boolean; // Can they arrive before or at the same time as you?
    };
    allSpawns: Array<{
      coordinates: Coordinates;
      spawnName?: string;
      distance: number;
      theirArrivalTime: number;
      canBeatYou: boolean;
    }>;
  }>;
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
      spawnName?: string;
      spawnCoordinates: Coordinates;
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
  spawnAvoidanceRadius?: number; // Distance to keep away from other player spawns
  dangerCorridorRadius?: number; // Width of corridor to treat as dangerous when path crosses hazardous zones
  clusterRadius?: number; // Radius to consider when clustering loot
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
 * Find clusters of nearby loot caches (groups of caches within a radius)
 * This helps us visit multiple loot locations efficiently
 * Returns clusters with just IDs for matching back to full candidates
 */
function findLootClusters(
  candidates: Array<{ coordinates: Coordinates; id: string; name: string; type: string }>,
  clusterRadius: number = 100
): Array<Array<{ id: string; coordinates: Coordinates }>> {
  const clusters: Array<Array<{ id: string; coordinates: Coordinates }>> = [];
  const assigned = new Set<string>();

  for (const candidate of candidates) {
    if (assigned.has(candidate.id)) continue;

    // Start a new cluster with this candidate
    const cluster: Array<{ id: string; coordinates: Coordinates }> = [
      { id: candidate.id, coordinates: candidate.coordinates }
    ];
    assigned.add(candidate.id);

    // Find all nearby candidates to add to this cluster
    for (const other of candidates) {
      if (assigned.has(other.id) || other.id === candidate.id) continue;
      
      const distance = calculateDistance(candidate.coordinates, other.coordinates);
      if (distance <= clusterRadius) {
        cluster.push({ id: other.id, coordinates: other.coordinates });
        assigned.add(other.id);
      }
    }

    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

/**
 * Calculate how many loot locations exist near a coordinate
 * Higher density == more valuable cluster
 */
function calculateLootDensityScore(
  location: Coordinates,
  caches: PointOfInterest[],
  radius: number = 150
): { count: number; score: number } {
  let count = 0;
  for (const cache of caches) {
    if (!cache.coordinates) continue;
    if (calculateDistance(location, cache.coordinates) <= radius) {
      count++;
    }
  }
  // Score is zero if we're alone, otherwise weight by nearby loot
  const score = count > 1 ? (count - 1) : 0;
  return { count, score };
}

/**
 * Distance from a point to a line segment (2D)
 */
function distancePointToSegment(point: Coordinates, start: Coordinates, end: Coordinates): number {
  const ax = start.x;
  const ay = start.y;
  const bx = end.x;
  const by = end.y;
  const px = point.x;
  const py = point.y;

  const abx = bx - ax;
  const aby = by - ay;
  const abLengthSquared = abx * abx + aby * aby;

  if (abLengthSquared === 0) {
    return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
  }

  let t = ((px - ax) * abx + (py - ay) * aby) / abLengthSquared;
  t = Math.max(0, Math.min(1, t));

  const closestX = ax + t * abx;
  const closestY = ay + t * aby;

  return Math.sqrt((px - closestX) * (px - closestX) + (py - closestY) * (py - closestY));
}

/**
 * Check if a path segment passes near any restricted zones
 */
function segmentPassesNearZones(
  start: Coordinates | null,
  end: Coordinates | null,
  zones: Coordinates[],
  radius: number
): boolean {
  if (!start || !end || zones.length === 0) return false;
  return zones.some(zone => distancePointToSegment(zone, start, end) <= radius);
}

/**
 * Determine if a coordinate is too close to enemy spawns
 */
function evaluateSpawnProximity(
  location: Coordinates,
  spawnCoords: Coordinates[],
  avoidRadius: number = 250
): { distance: number; isNearEnemySpawn: boolean; score: number } {
  if (spawnCoords.length === 0) {
    return { distance: Infinity, isNearEnemySpawn: false, score: 0 };
  }

  let minDistance = Infinity;
  for (const spawn of spawnCoords) {
    const distance = calculateDistance(location, spawn);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  const isNearEnemySpawn = minDistance <= avoidRadius;
  const score = isNearEnemySpawn ? Math.max(0, 1 - minDistance / avoidRadius) : 0;

  return { distance: minDistance, isNearEnemySpawn, score };
}

/**
 * Predict other players' likely paths: spawn -> nearest loot -> extraction
 * Returns timing information for when they'll be at each location
 */
interface PredictedPlayerPath {
  spawn: Coordinates;
  spawnName?: string;
  lootTargets: Array<{
    coordinates: Coordinates;
    name: string;
    arrivalTime: number; // Time from round start
    departureTime: number; // Time after looting (assume 30s per loot)
  }>;
  extraction: Coordinates;
  extractionArrivalTime: number;
  totalPath: Array<{
    coordinates: Coordinates;
    time: number;
    type: 'spawn' | 'loot' | 'extraction';
  }>;
}

function predictOtherPlayerPaths(
  otherSpawns: Waypoint[],
  userSpawn: Coordinates,
  availableLoot: Array<{ coordinates: Coordinates; id: string; name: string }>,
  extractionPoints: Waypoint[],
  playerSpeed: number,
  lootTimePerCache: number = 30 // seconds to loot each cache
): PredictedPlayerPath[] {
  const predictedPaths: PredictedPlayerPath[] = [];
  
  if (extractionPoints.length === 0 || availableLoot.length === 0) {
    return predictedPaths;
  }
  
  // Find primary extraction (closest to center or first available)
  const primaryExtraction = extractionPoints.find(ep => ep.coordinates)?.coordinates;
  if (!primaryExtraction) return predictedPaths;
  
  for (const spawn of otherSpawns) {
    if (!spawn.coordinates) continue;
    
    // Skip user's spawn
    const distToUserSpawn = calculateDistance(spawn.coordinates, userSpawn);
    if (distToUserSpawn < 10) continue;
    
    // Predict their path: spawn -> 2-3 nearest loot caches -> extraction
    if (!spawn.coordinates) continue;
    
    const numLootTargets = Math.min(3, Math.floor(availableLoot.length / 2));
    const lootCandidates = [...availableLoot]
      .map(loot => ({
        ...loot,
        distance: calculateDistance(spawn.coordinates!, loot.coordinates),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, numLootTargets);
    
    // Build their predicted path
    let currentTime = 0;
    let currentLocation = spawn.coordinates;
    const lootTargets: PredictedPlayerPath['lootTargets'] = [];
    const totalPath: PredictedPlayerPath['totalPath'] = [
      { coordinates: spawn.coordinates, time: 0, type: 'spawn' }
    ];
    
    for (const loot of lootCandidates) {
      const travelTime = calculateDistance(currentLocation, loot.coordinates) / playerSpeed;
      currentTime += travelTime;
      const arrivalTime = currentTime;
      const departureTime = currentTime + lootTimePerCache;
      
      lootTargets.push({
        coordinates: loot.coordinates,
        name: loot.name,
        arrivalTime,
        departureTime,
      });
      
      totalPath.push({
        coordinates: loot.coordinates,
        time: arrivalTime,
        type: 'loot',
      });
      
      currentLocation = loot.coordinates;
      currentTime = departureTime;
    }
    
    // Then they go to extraction
    const extractionTravelTime = calculateDistance(currentLocation, primaryExtraction) / playerSpeed;
    const extractionArrivalTime = currentTime + extractionTravelTime;
    
    totalPath.push({
      coordinates: primaryExtraction,
      time: extractionArrivalTime,
      type: 'extraction',
    });
    
    predictedPaths.push({
      spawn: spawn.coordinates,
      spawnName: spawn.name,
      lootTargets,
      extraction: primaryExtraction,
      extractionArrivalTime,
      totalPath,
    });
  }
  
  return predictedPaths;
}

/**
 * Check if a location will be occupied by another player at a given time
 */
function willLocationBeOccupied(
  location: Coordinates,
  time: number,
  predictedPaths: PredictedPlayerPath[],
  proximityRadius: number = 50 // Consider "occupied" if within this radius
): {
  willBeOccupied: boolean;
  occupiedBy: Array<{
    spawnName?: string;
    arrivalTime: number;
    departureTime: number;
    distance: number;
  }>;
} {
  const occupiedBy: Array<{
    spawnName?: string;
    arrivalTime: number;
    departureTime: number;
    distance: number;
  }> = [];
  
  for (const path of predictedPaths) {
    // Check each point in their path
    for (let i = 0; i < path.totalPath.length - 1; i++) {
      const segmentStart = path.totalPath[i];
      const segmentEnd = path.totalPath[i + 1];
      
      // Check if they'll be near this location during this segment
      const segmentStartTime = segmentStart.time;
      const segmentEndTime = segmentEnd.time;
      
      if (time >= segmentStartTime && time <= segmentEndTime) {
        // They're traveling between these points - check if path comes close
        const distToSegment = distancePointToSegment(
          location,
          segmentStart.coordinates,
          segmentEnd.coordinates
        );
        
        if (distToSegment <= proximityRadius) {
          // Calculate when they'll be closest
          const segmentDuration = segmentEndTime - segmentStartTime;
          const progress = segmentDuration > 0 ? (time - segmentStartTime) / segmentDuration : 0;
          const closestTime = segmentStartTime + progress * segmentDuration;
          
          occupiedBy.push({
            spawnName: path.spawnName,
            arrivalTime: segmentStartTime,
            departureTime: segmentEndTime,
            distance: distToSegment,
          });
        }
      }
      
      // Also check if they're at a loot location (stationary)
      if (segmentStart.type === 'loot') {
        const lootTarget = path.lootTargets.find(lt => 
          calculateDistance(lt.coordinates, segmentStart.coordinates) < 1
        );
        if (lootTarget && time >= lootTarget.arrivalTime && time <= lootTarget.departureTime) {
          const dist = calculateDistance(location, segmentStart.coordinates);
          if (dist <= proximityRadius) {
            occupiedBy.push({
              spawnName: path.spawnName,
              arrivalTime: lootTarget.arrivalTime,
              departureTime: lootTarget.departureTime,
              distance: dist,
            });
          }
        }
      }
    }
  }
  
  return {
    willBeOccupied: occupiedBy.length > 0,
    occupiedBy: occupiedBy.sort((a, b) => a.arrivalTime - b.arrivalTime),
  };
}

/**
 * Evaluate a path segment (next 2-3 steps) to find the best immediate choice
 * This implements look-ahead instead of pure greedy
 */
function evaluatePathSegment(
  current: Coordinates,
  candidates: Array<{ 
    coordinates: Coordinates; 
    id: string; 
    name: string;
    type: string;
    distanceToExtraction?: number;
    isNearExtraction?: boolean;
    isDangerous?: boolean;
    dangerScore?: number;
    lootClusterScore?: number;
    lootClusterCount?: number;
    nearestSpawnDistance?: number;
    isNearEnemySpawn?: boolean;
    spawnDangerScore?: number;
  }>,
  visited: Set<string>,
  primaryExtraction: Coordinates | null,
  lookAheadDepth: number = 2,
  dangerZones: Coordinates[] = [],
  dangerRadius: number = 50,
  spawnZones: Coordinates[] = [],
  spawnAvoidRadius: number = 200,
  currentDistToExtraction?: number // Track current distance to extraction for backtracking detection
): { 
  bestNext: typeof candidates[0] | null;
  score: number;
} {
  if (candidates.length === 0 || lookAheadDepth === 0) {
    return { bestNext: null, score: -Infinity };
  }

  let bestScore = -Infinity;
  let bestCandidate: typeof candidates[0] | null = null;

  // Calculate current distance to extraction if not provided
  const currentDistToExt = currentDistToExtraction !== undefined 
    ? currentDistToExtraction 
    : (primaryExtraction ? calculateDistance(current, primaryExtraction) : Infinity);

  // Evaluate each candidate by looking ahead
  for (const candidate of candidates) {
    if (visited.has(candidate.id)) continue;

    // Calculate immediate score
    const distanceToCandidate = calculateDistance(current, candidate.coordinates);
    const distToExt = primaryExtraction ? calculateDistance(candidate.coordinates, primaryExtraction) : Infinity;
    
    // Score factors (higher is better)
    let score = 0;
    
    // Distance penalty (smaller penalty to allow look-ahead to matter)
    score -= distanceToCandidate * 0.05; // Reduced from 0.1 to make distance less dominant
    
    // NATURAL FLOW: Strongly penalize backtracking (moving away from extraction)
    if (primaryExtraction && currentDistToExt < Infinity) {
      const distChange = distToExt - currentDistToExt;
      if (distChange > 0) {
        // Moving away from extraction - penalize based on how far we're backtracking
        score -= distChange * 0.5; // Strong penalty for backtracking
      } else {
        // Moving toward extraction - reward based on how much closer we're getting
        score += Math.abs(distChange) * 0.3; // Reward for natural flow toward extraction
      }
    }
    
    // Strongly prefer near extraction
    if (candidate.isNearExtraction) {
      score += 50; // Reduced from 100 to allow other factors to matter
    } else if (primaryExtraction) {
      // Penalty for being far from extraction (stronger penalty)
      score -= distToExt * 0.3; // Increased from 0.2
    }
    
    // Avoid dangerous areas
    if (candidate.isDangerous) {
      score -= (candidate.dangerScore || 0) * 30; // Increased penalty
    }

    // Avoid corridors that run through known danger objectives
    if (segmentPassesNearZones(current, candidate.coordinates, dangerZones, dangerRadius)) {
      score -= 40;
    }

    // Avoid running through enemy spawn zones
    if (segmentPassesNearZones(current, candidate.coordinates, spawnZones, spawnAvoidRadius)) {
      score -= 50;
    }

    if (candidate.isNearEnemySpawn) {
      score -= 35;
    }

    if (candidate.spawnDangerScore) {
      score -= candidate.spawnDangerScore * 60;
    }

    if (candidate.lootClusterScore) {
      score += candidate.lootClusterScore * 8;
    }
    
    // Look ahead: evaluate what we could do after this candidate
    // This is the KEY improvement - considers future path quality
    if (lookAheadDepth > 1) {
      const remainingCandidates = candidates.filter(c => 
        c.id !== candidate.id && !visited.has(c.id)
      );
      
      if (remainingCandidates.length > 0) {
        // Find best next step from this candidate
        const nextEvaluation = evaluatePathSegment(
          candidate.coordinates,
          remainingCandidates,
          new Set([...visited, candidate.id]),
          primaryExtraction,
          lookAheadDepth - 1,
          dangerZones,
          dangerRadius,
          spawnZones,
          spawnAvoidRadius,
          distToExt // Pass distance to extraction for backtracking detection
        );
        
        // Add future path quality (increased weight to make look-ahead matter more)
        // Consider both the score and the distance to next target
        if (nextEvaluation.bestNext) {
          const distToNext = calculateDistance(candidate.coordinates, nextEvaluation.bestNext.coordinates);
          const futureEfficiency = 50 - (distToNext * 0.1); // Reward efficient future paths
          score += nextEvaluation.score * 0.5 + futureEfficiency; // Increased from 0.3 and added efficiency bonus
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return { 
    bestNext: bestCandidate as typeof candidates[0] | null, 
    score: bestScore 
  };
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
    waypointSpawnAnalysis: [],
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
  
  // Calculate spawn analysis for each waypoint
  if (allSpawnPoints.length > 0) {
    for (const { waypoint, time: ourArrivalTime, index } of waypointsWithTime) {
      // Skip spawn and extraction waypoints for analysis (they're less relevant)
      if (waypoint.type === 'spawn' || waypoint.type === 'extraction' || waypoint.type === 'raider-key') {
        continue;
      }
      
      const spawnAnalysis: Array<{
        coordinates: Coordinates;
        spawnName?: string;
        distance: number;
        theirArrivalTime: number;
        canBeatYou: boolean;
      }> = [];
      
      let closestSpawn: typeof spawnAnalysis[0] | null = null;
      let closestDistance = Infinity;
      
      for (const otherSpawn of allSpawnPoints) {
        if (!otherSpawn.coordinates) continue;
        
        // Skip if this is our spawn point
        const distToOurSpawn = calculateDistance(otherSpawn.coordinates, userSpawn);
        if (distToOurSpawn < 10) continue;
        
        const distance = calculateDistance(otherSpawn.coordinates, waypoint.coordinates);
        const theirArrivalTime = distance / playerSpeed;
        const canBeatYou = theirArrivalTime <= ourArrivalTime;
        
        const spawnInfo = {
          coordinates: otherSpawn.coordinates,
          spawnName: otherSpawn.name,
          distance,
          theirArrivalTime,
          canBeatYou,
        };
        
        spawnAnalysis.push(spawnInfo);
        
        // Track closest spawn
        if (distance < closestDistance) {
          closestDistance = distance;
          closestSpawn = spawnInfo;
        }
      }
      
      // Sort by distance (closest first)
      spawnAnalysis.sort((a, b) => a.distance - b.distance);
      
      if (closestSpawn) {
        risk.waypointSpawnAnalysis!.push({
          waypointIndex: index,
          waypointName: waypoint.name,
          yourArrivalTime: ourArrivalTime,
          closestSpawn,
          allSpawns: spawnAnalysis,
        });
      }
    }
  }

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
          spawnName: otherSpawn.name,
          spawnCoordinates: otherSpawn.coordinates,
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
  const spawnAvoidRadius = options.spawnAvoidanceRadius ?? 250;
  const dangerCorridorRadius = options.dangerCorridorRadius ?? dangerRadius * 1.5;
  const clusterRadius = options.clusterRadius ?? 150;
  const dangerZoneCoords = dangerousPOIs
    .filter(poi => poi.coordinates)
    .map(poi => poi.coordinates!) as Coordinates[];
  
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
  const userSpawnCoords: Coordinates | null =
    options.startAtCoordinates || (spawnPoints[0]?.coordinates ?? null);
  const otherSpawnCoords: Coordinates[] = (allSpawnPoints || [])
    .filter(sp => sp.coordinates)
    .filter(sp => {
      if (!userSpawnCoords || !sp.coordinates) return true;
      return calculateDistance(sp.coordinates, userSpawnCoords) > 5;
    })
    .map(sp => sp.coordinates!) as Coordinates[];
  
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
      arrivalTime: 0,
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
        arrivalTime: 0,
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
      const lootDensity = calculateLootDensityScore(coords, cachePOIs, clusterRadius);
      const spawnDanger = evaluateSpawnProximity(coords, otherSpawnCoords, spawnAvoidRadius);
      const dangerReasons = [...(dangerInfo?.reasons || [])];
      if (spawnDanger.isNearEnemySpawn) {
        dangerReasons.push(`Near enemy spawn (${Math.round(spawnDanger.distance)} units)`);
      }
      const baseDangerLevel = dangerInfo?.level || 'low';
      const dangerLevel = spawnDanger.isNearEnemySpawn && baseDangerLevel === 'low' ? 'medium' : baseDangerLevel;
      const isDangerous = dangerInfo ? dangerInfo.level !== 'low' : false;
      
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
        lootClusterScore: lootDensity.score,
        lootClusterCount: lootDensity.count,
        nearestSpawnDistance: spawnDanger.distance,
        isNearEnemySpawn: spawnDanger.isNearEnemySpawn,
        spawnDangerScore: spawnDanger.score,
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
      const lootDensity = calculateLootDensityScore(coords, cachePOIs, clusterRadius);
      const spawnDanger = evaluateSpawnProximity(coords, otherSpawnCoords, spawnAvoidRadius);
      const dangerReasons = [...(dangerInfo?.reasons || [])];
      if (spawnDanger.isNearEnemySpawn) {
        dangerReasons.push(`Near enemy spawn (${Math.round(spawnDanger.distance)} units)`);
      }
      const baseDangerLevel = dangerInfo?.level || 'medium';
      const dangerLevel = spawnDanger.isNearEnemySpawn && baseDangerLevel === 'medium' ? 'high' : baseDangerLevel;
      const isDangerous = dangerInfo ? dangerInfo.level !== 'high' && dangerInfo.level !== 'extreme' : false; // ARCs are inherently dangerous, but we want safer ones
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
        lootClusterScore: lootDensity.score,
        lootClusterCount: lootDensity.count,
        nearestSpawnDistance: spawnDanger.distance,
        isNearEnemySpawn: spawnDanger.isNearEnemySpawn,
        spawnDangerScore: spawnDanger.score,
      };
    });

  // Combine and sort all candidates (caches + ARCs)
  // Prioritize: near extraction > not dangerous > ARCs for quests > lower danger score
  const allCandidates = [...cacheCandidates, ...arcCandidates].sort((a, b) => {
    // Prioritize: near extraction > not dangerous > lower danger score
    if (a.isNearExtraction !== b.isNearExtraction) {
      return a.isNearExtraction ? -1 : 1;
    }
    if (!!a.isNearEnemySpawn !== !!b.isNearEnemySpawn) {
      return a.isNearEnemySpawn ? 1 : -1;
    }
    if (a.isDangerous !== b.isDangerous) {
      return a.isDangerous ? 1 : -1;
    }
    if ((a.lootClusterScore || 0) !== (b.lootClusterScore || 0)) {
      return (b.lootClusterScore || 0) - (a.lootClusterScore || 0);
    }
    // Prefer ARCs slightly (for quest objectives) if both are safe and near extraction
    if (a.type === 'arc' && b.type === 'cache' && a.isNearExtraction && !a.isDangerous) {
      return -1;
    }
    if (a.type === 'cache' && b.type === 'arc' && b.isNearExtraction && !b.isDangerous) {
      return 1;
    }
    if ((a.nearestSpawnDistance || Infinity) !== (b.nearestSpawnDistance || Infinity)) {
      return (b.nearestSpawnDistance || Infinity) - (a.nearestSpawnDistance || Infinity);
    }
    if (a.dangerScore !== b.dangerScore) {
      return a.dangerScore - b.dangerScore;
    }
    return a.distanceToExtraction - b.distanceToExtraction;
  });

  // Predict other players' paths for avoidance (after cacheCandidates is created)
  const otherSpawnWaypoints = (allSpawnPoints || [])
    .filter(sp => sp.coordinates)
    .filter(sp => {
      if (!userSpawnCoords || !sp.coordinates) return true;
      return calculateDistance(sp.coordinates, userSpawnCoords) > 5;
    });
  
  const availableLootForPrediction = cacheCandidates.map(c => ({
    coordinates: c.coordinates,
    id: c.id,
    name: c.name,
  }));
  
  const predictedPlayerPaths = avoidInterception && otherSpawnWaypoints.length > 0
    ? predictOtherPlayerPaths(
        otherSpawnWaypoints,
        userSpawnCoords || { x: 0, y: 0 },
        availableLootForPrediction,
        extractionPoints,
        playerSpeed,
        30 // 30 seconds per loot
      )
    : [];

  // Phase 1: Get near extraction quickly (first 2-3 caches should be near extraction)
  const maxCaches = options.maxCaches ?? Math.min(15, cacheCandidates.length);
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
        const travelTimeToFirst = calculateDistance(prevPoint, nearestToExt.coordinates) / averageSpeed;
        path.push({
          id: nearestToExt.id,
          name: nearestToExt.name,
          coordinates: nearestToExt.coordinates,
          type: 'cache',
          order: currentOrder++,
          instruction: `Head to ${nearestToExt.name} (near extraction zone)`,
          distanceToExtraction: nearestToExt.distanceToExtraction,
          isNearExtraction: true,
          arrivalTime: travelTimeToFirst,
        });
        visited.add(nearestToExt.id);
        timeSpent += travelTimeToFirst;
        currentPoint = nearestToExt.coordinates;
        cachesVisited++;
      }
    }
  }

  // Phase 2: Loot caches and kill ARCs near extraction (prioritize these)
  // Respect maxCaches option instead of hardcoding
  let targetsVisited = 0; // Count both caches and ARCs
  const maxTargets = options.maxCaches ?? 7; // Use maxCaches option, default to 7 loot targets
  
  // Track distance to extraction for backtracking detection and natural flow
  let distToExt = currentPoint ? calculateDistance(currentPoint, primaryExtraction) : Infinity;
  
  while (targetsVisited < maxTargets) {
    // Check if we should head to extraction soon
    const maxTime = options.maxTimeBeforeExtraction || 300; // 5 minutes default
    distToExt = currentPoint ? calculateDistance(currentPoint, primaryExtraction) : Infinity;
    const timeToExt = distToExt / averageSpeed;

    // IMPROVED TIME MANAGEMENT: Dynamic extraction prioritization
    const remainingTime = maxTime - timeSpent;
    const timeToReachExt = timeToExt; // Same as timeToExt, just clearer naming
    
    // Calculate how much time we have left for looting
    const timeForLooting = remainingTime - timeToReachExt - 30; // 30 second safety buffer
    
    // If we're running out of time or far from extraction, prioritize near-extraction targets
    // Also consider if we have enough time to safely loot and extract
    const shouldPrioritizeExtraction = 
      timeSpent + timeToExt > maxTime * 0.7 || 
      distToExt > extractionProximity * 2 ||
      timeForLooting < 60; // Less than 1 minute left for looting
    
    // When time is very low, restrict to targets within 50 units
    const maxDistanceForLowTime = timeForLooting < 60 ? 50 : Infinity;

    // Find next target (cache or ARC)
    let nextTarget = null;
    
    // IMPROVED LOGIC: Check for loot clusters first (efficient multi-loot visits)
    if (currentPoint) {
      const nearbyClusters = findLootClusters(
        allCandidates.filter(c => {
          if (c.type === 'arc') return !visitedARCs.has(c.id) && !c.isDangerous;
          return !visited.has(c.id) && !c.isDangerous;
        }).map(c => ({ coordinates: c.coordinates, id: c.id, name: c.name, type: c.type })),
        clusterRadius
      );

      // If we find a cluster near our position, prioritize visiting it
      for (const cluster of nearbyClusters) {
        const clusterCenter = cluster[0].coordinates;
        const distToCluster = calculateDistance(currentPoint, clusterCenter);
        
        // If cluster is close and has multiple loot locations, it's worth visiting
        const maxClusterTravel = clusterRadius * 2;
        if (distToCluster < maxClusterTravel && cluster.length >= 2) {
          // Sort cluster by distance to current position
          cluster.sort((a, b) => {
            const distA = calculateDistance(currentPoint!, a.coordinates);
            const distB = calculateDistance(currentPoint!, b.coordinates);
            return distA - distB;
          });
          
          // Use first item in cluster as next target - find full candidate with all properties
          const clusterTarget = allCandidates.find(c => c.id === cluster[0].id);
          if (clusterTarget) {
            const isArc = clusterTarget.type === 'arc';
            const alreadyVisited = isArc ? visitedARCs.has(clusterTarget.id) : visited.has(clusterTarget.id);
            if (!alreadyVisited) {
              nextTarget = clusterTarget;
              break; // Found a good cluster to visit
            }
          }
        }
      }
    }

    // If no cluster found, use look-ahead evaluation instead of pure greedy
    if (!nextTarget) {
      if (shouldPrioritizeExtraction) {
        // Only consider targets very close to extraction and not dangerous
        // When time is very low, also restrict to targets very close to current position
        const validCandidates = allCandidates.filter(c => {
          if (c.type === 'arc') {
            if (!visitedARCs.has(c.id) && c.isNearExtraction && !c.isDangerous) {
              // Check distance constraint if time is low
              if (maxDistanceForLowTime < Infinity && currentPoint) {
                return calculateDistance(currentPoint, c.coordinates) <= maxDistanceForLowTime;
              }
              return true;
            }
            return false;
          }
          if (!visited.has(c.id) && c.isNearExtraction && !c.isDangerous) {
            // Check distance constraint if time is low
            if (maxDistanceForLowTime < Infinity && currentPoint) {
              return calculateDistance(currentPoint, c.coordinates) <= maxDistanceForLowTime;
            }
            return true;
          }
          return false;
        });
        
        const spawnSafeCandidates = validCandidates.filter(c => !c.isNearEnemySpawn);
        const candidatesToSearch = spawnSafeCandidates.length > 0 ? spawnSafeCandidates : validCandidates;
        
        if (candidatesToSearch.length > 0 && currentPoint) {
          // Use look-ahead evaluation (2 steps ahead) instead of pure greedy
          const evaluation = evaluatePathSegment(
            currentPoint,
            candidatesToSearch,
            visited,
            primaryExtraction,
            2, // Look 2 steps ahead for better decisions
            dangerZoneCoords,
            dangerCorridorRadius,
            otherSpawnCoords,
            spawnAvoidRadius,
            distToExt // Pass current distance to extraction for backtracking detection
          );
          nextTarget = evaluation.bestNext as typeof candidatesToSearch[0] | null;
        }
      } else {
        // Normal priority: use look-ahead to find best path
        const validCandidates = allCandidates.filter(c => {
          if (c.type === 'arc') {
            if (visitedARCs.has(c.id) || c.isDangerous) return false;
          } else {
            if (visited.has(c.id) || c.isDangerous) return false;
          }
          
          // Filter out candidates that will be occupied by other players
          if (avoidInterception && predictedPlayerPaths.length > 0 && currentPoint) {
            const travelTime = calculateDistance(currentPoint, c.coordinates) / averageSpeed;
            const arrivalTime = timeSpent + travelTime;
            const occupation = willLocationBeOccupied(
              c.coordinates,
              arrivalTime,
              predictedPlayerPaths,
              50
            );
            // Prefer candidates that won't be occupied, but don't completely exclude them
            // (we'll add wait time if needed)
            if (occupation.willBeOccupied) {
              // Still allow, but it will be penalized by wait time
            }
          }
          
          return true;
        });
        
        const spawnSafeCandidates = validCandidates.filter(c => !c.isNearEnemySpawn);
        const candidatesToSearch =
          spawnSafeCandidates.length > 0 ? spawnSafeCandidates : validCandidates;
        
        if (candidatesToSearch.length > 0 && currentPoint) {
          // Prefer near-extraction targets first, but use look-ahead
          const nearExtraction = candidatesToSearch.filter(c => c.isNearExtraction);
          const prioritizedCandidates = nearExtraction.length > 0 ? nearExtraction : candidatesToSearch;
          
          // Use look-ahead evaluation (2 steps ahead) for smarter path selection
          const evaluation = evaluatePathSegment(
            currentPoint,
            prioritizedCandidates,
            visited,
            primaryExtraction,
            2, // Look 2 steps ahead for better decisions
            dangerZoneCoords,
            dangerCorridorRadius,
            otherSpawnCoords,
            spawnAvoidRadius,
            distToExt // Pass current distance to extraction for backtracking detection
          );
          nextTarget = evaluation.bestNext as typeof prioritizedCandidates[0] | null;
        } else if (validCandidates.length > 0) {
          // Fallback: use pre-sorted list
          nextTarget = validCandidates[0];
        }
      }
    }

    if (!nextTarget) break;

    const travelTime = currentPoint ? calculateDistance(currentPoint, nextTarget.coordinates) / averageSpeed : 0;
    const arrivalTime = timeSpent + travelTime;
    
    // Check if location will be occupied by other players and calculate wait time
    // 
    // WAIT TIME LOGIC:
    // The algorithm calculates the fastest possible arrival time from ANY spawn point
    // to determine when other players could reach this location. Wait times are added to:
    // 
    // 1. If they arrive BEFORE you: Wait until they've cleared (proportional, max 60s)
    // 2. If they arrive WITHIN 60s of you: Wait to avoid conflict (proportional, max 60s)
    // 3. If they arrive SHORTLY AFTER you (within 30s): Add buffer (proportional, max 60s)
    // 
    // This ensures you avoid running into other players at loot locations.
    let waitTime = 0;
    let waitReason = '';
    let fastestArrivalTime = Infinity;
    let fastestSpawnName = '';
    let safeWindow = Infinity; // How long you have before another player could arrive
    
    if (avoidInterception && otherSpawnWaypoints.length > 0) {
      // Calculate fastest possible arrival time from any spawn point
      for (const otherSpawn of otherSpawnWaypoints) {
        if (!otherSpawn.coordinates) continue;
        
        // Direct distance from spawn to target (fastest possible route)
        const directDistance = calculateDistance(otherSpawn.coordinates, nextTarget.coordinates);
        const fastestTime = directDistance / playerSpeed;
        
        if (fastestTime < fastestArrivalTime) {
          fastestArrivalTime = fastestTime;
          fastestSpawnName = otherSpawn.name || 'Player';
        }
      }
      
      // Also check predicted paths for more accurate timing (if they're going there)
      if (predictedPlayerPaths.length > 0) {
        const occupation = willLocationBeOccupied(
          nextTarget.coordinates,
          arrivalTime,
          predictedPlayerPaths,
          50 // proximity radius
        );
        
        if (occupation.willBeOccupied && occupation.occupiedBy.length > 0) {
          // Find the latest departure time from predicted paths
          const latestDeparture = Math.max(...occupation.occupiedBy.map(o => o.departureTime));
          if (latestDeparture > arrivalTime) {
            waitTime = latestDeparture - arrivalTime + 5; // Add 5 second buffer
            const waitMin = Math.floor(waitTime / 60);
            const waitSec = Math.round(waitTime % 60);
            const players = occupation.occupiedBy.map(o => o.spawnName || 'Player').join(', ');
            waitReason = `Wait ${waitMin}m ${waitSec}s for ${players} to clear`;
          }
        }
      }
      
      // If no predicted path conflict, check if we need to wait based on fastest arrival
      if (waitTime === 0 && fastestArrivalTime < Infinity) {
        // Calculate if there's any risk of conflict
        const timeDifference = fastestArrivalTime - arrivalTime; // Positive = they arrive after, negative = before
        const absTimeDifference = Math.abs(timeDifference);
        const riskWindow = 60; // 60 second window - if they arrive within 60s of us, it's risky
        let waitScenario = ''; // Track which scenario triggered the wait
        
        // Calculate safe window: how long you have before the next player could arrive
        // This is the time from your arrival (after wait) until they could arrive
        let safeWindow = 0;
        
        // If they arrive before us, wait for them to clear
        if (fastestArrivalTime < arrivalTime) {
          // They could arrive before us - wait until they've had time to pass
          // Assume they'll spend 30 seconds at the location, then add buffer
          const theirDepartureTime = fastestArrivalTime + 30; // 30s to loot
          if (theirDepartureTime > arrivalTime) {
            // Calculate wait time: time until they clear + safety buffer
            // Make it proportional to how much time they'll be there, but cap at 60s
            const timeUntilTheyClear = theirDepartureTime - arrivalTime;
            const safetyBuffer = Math.min(15, timeUntilTheyClear * 0.3); // 30% of clear time or 15s max
            waitTime = Math.min(60, Math.round(timeUntilTheyClear + safetyBuffer)); // Cap at 60s
            waitScenario = 'before';
            
            // Safe window: from when we finish waiting until they could arrive again (if they come back)
            // Or until the next fastest spawn could arrive
            safeWindow = Math.max(0, fastestArrivalTime - (arrivalTime + waitTime));
          } else {
            // They'll be gone before we arrive, but add buffer for safety
            // Wait time proportional to how close they were
            const gap = arrivalTime - theirDepartureTime;
            waitTime = Math.min(60, Math.max(5, Math.round(gap * 0.2))); // 20% of gap, min 5s, max 60s
            waitScenario = 'buffer';
            safeWindow = Math.max(0, fastestArrivalTime - (arrivalTime + waitTime));
          }
        } 
        // If they arrive close to the same time (within risk window), wait
        else if (absTimeDifference <= riskWindow) {
          // They arrive close to when we do - wait to avoid conflict
          // Wait time should be proportional to how close they are
          const theirDepartureTime = fastestArrivalTime + 30; // 30s to loot
          const timeUntilTheyClear = theirDepartureTime - arrivalTime;
          
          // Calculate wait: enough to let them clear, proportional to risk
          const riskFactor = 1 - (absTimeDifference / riskWindow); // 1.0 if same time, 0.0 if 60s apart
          const baseWait = Math.max(10, timeUntilTheyClear);
          waitTime = Math.min(60, Math.round(baseWait + (riskFactor * 20))); // Add up to 20s based on risk
          waitScenario = 'close';
          
          // Safe window: from when we finish waiting until they could arrive
          safeWindow = Math.max(0, fastestArrivalTime - (arrivalTime + waitTime));
        }
        // If they arrive after us but we're still at risk, add wait
        else if (fastestArrivalTime <= arrivalTime + 30) {
          // They could arrive while we're still looting - add buffer
          // Wait time proportional to how soon they could arrive
          const timeUntilTheyArrive = fastestArrivalTime - arrivalTime;
          waitTime = Math.min(60, Math.max(5, Math.round(timeUntilTheyArrive * 0.3))); // 30% of time until arrival, min 5s, max 60s
          waitScenario = 'buffer';
          
          // Safe window: from when we finish waiting until they could arrive
          safeWindow = Math.max(0, fastestArrivalTime - (arrivalTime + waitTime));
        } else {
          // They arrive well after us - no wait needed, but calculate safe window
          safeWindow = fastestArrivalTime - arrivalTime;
        }
        
        if (waitTime > 0) {
          const waitMin = Math.floor(waitTime / 60);
          const waitSec = Math.round(waitTime % 60);
          const fastestMin = Math.floor(fastestArrivalTime / 60);
          const fastestSec = Math.round(fastestArrivalTime % 60);
          const yourMin = Math.floor(arrivalTime / 60);
          const yourSec = Math.round(arrivalTime % 60);
          
          // Create clearer wait reason based on the scenario
          if (waitScenario === 'before') {
            // They arrive before us
            waitReason = `⏱️ Wait ${waitMin}m ${waitSec}s - ${fastestSpawnName} could arrive at ${fastestMin}m ${fastestSec}s (before you at ${yourMin}m ${yourSec}s). Wait for them to clear.`;
          } else if (waitScenario === 'close') {
            // They arrive close to the same time
            waitReason = `⏱️ Wait ${waitMin}m ${waitSec}s - ${fastestSpawnName} could arrive at ${fastestMin}m ${fastestSec}s (within ${Math.round(absTimeDifference)}s of you at ${yourMin}m ${yourSec}s). Avoid conflict.`;
          } else {
            // They arrive shortly after or safety buffer
            waitReason = `⏱️ Wait ${waitMin}m ${waitSec}s - ${fastestSpawnName} could arrive at ${fastestMin}m ${fastestSec}s (shortly after you at ${yourMin}m ${yourSec}s). Safety buffer.`;
          }
        }
      } else if (fastestArrivalTime < Infinity) {
        // No wait needed, but calculate safe window
        safeWindow = Math.max(0, fastestArrivalTime - arrivalTime);
      }
    }
    
    timeSpent += travelTime + waitTime;

    // Build instruction with danger info and wait time (nextTarget is from allCandidates, has all properties)
    let instruction = '';
    if (nextTarget.type === 'arc') {
      const arcDifficulty = 'arcDifficulty' in nextTarget ? (nextTarget.arcDifficulty as 'easy' | 'medium' | 'hard' | 'extreme') : 'medium';
      instruction = `Kill ARC: ${nextTarget.name} (${arcDifficulty} difficulty)`;
      if (nextTarget.isNearExtraction) {
        instruction += ' (safe zone - near extraction)';
      } else if (nextTarget.distanceToExtraction !== undefined) {
        instruction += ` (${Math.round(nextTarget.distanceToExtraction)} units from extraction)`;
      }
    } else {
      instruction = `Loot ${nextTarget.name}`;
      if (nextTarget.isNearExtraction) {
        instruction += ' (safe zone - near extraction)';
      } else if (nextTarget.distanceToExtraction !== undefined) {
        instruction += ` (${Math.round(nextTarget.distanceToExtraction)} units from extraction)`;
      }
    }
    
    if (nextTarget.dangerLevel && nextTarget.dangerLevel !== 'low' && nextTarget.dangerReasons && nextTarget.dangerReasons.length > 0) {
      instruction += ` ⚠️ ${nextTarget.dangerLevel.toUpperCase()}: ${nextTarget.dangerReasons.join(', ')}`;
    }
    if (nextTarget.lootClusterCount && nextTarget.lootClusterCount > 1) {
      const clusterCount = nextTarget.lootClusterCount;
      instruction += ` 🔁 Loot cluster (${clusterCount} caches nearby)`;
    }
    if (nextTarget.isNearEnemySpawn) {
      instruction += ` ⚠️ Enemy spawn proximity`;
    }
    if (waitTime > 0 && waitReason) {
      instruction += ` ⏱️ ${waitReason}`;
    }

    const waypoint: PathWaypoint = {
      id: nextTarget.id,
      name: nextTarget.name,
      coordinates: nextTarget.coordinates,
      type: nextTarget.type as 'spawn' | 'cache' | 'extraction' | 'raider-key' | 'arc' | 'other',
      order: currentOrder++,
      instruction,
      distanceToExtraction: nextTarget.distanceToExtraction,
      isNearExtraction: nextTarget.isNearExtraction,
      dangerLevel: nextTarget.dangerLevel,
      dangerReasons: nextTarget.dangerReasons,
      arrivalTime: arrivalTime,
      waitTime: waitTime > 0 ? waitTime : undefined,
      waitReason: waitTime > 0 ? waitReason : undefined,
      fastestPlayerArrivalTime: fastestArrivalTime < Infinity ? fastestArrivalTime : undefined,
      fastestPlayerSpawnName: fastestSpawnName || undefined,
      safeWindow: safeWindow < Infinity ? safeWindow : undefined,
    };

    if (nextTarget.type === 'arc' && 'arcDifficulty' in nextTarget) {
      waypoint.arcDifficulty = nextTarget.arcDifficulty as 'easy' | 'medium' | 'hard' | 'extreme';
    }

    path.push(waypoint);
    
    if (nextTarget.type === 'arc') {
      visitedARCs.add(nextTarget.id);
    } else {
      visited.add(nextTarget.id);
    }
    
    currentPoint = nextTarget.coordinates;
    targetsVisited++;
    
    // Update distance to extraction for next iteration (for backtracking detection)
    distToExt = currentPoint ? calculateDistance(currentPoint, primaryExtraction) : Infinity;

    // IMPROVED TIME MANAGEMENT: Check remaining time before next iteration
    const remainingTimeAfter = maxTime - timeSpent;
    const timeToExtAfter = distToExt / averageSpeed;
    
    // If we don't have enough time to safely reach extraction, stop now
    // Add buffer: need at least 30 seconds to reach extraction safely
    // BUT: Only break if we have at least 8 targets, otherwise try to get more
    if (remainingTimeAfter < timeToExtAfter + 30 && targetsVisited >= maxTargets) {
      break;
    }
  }
  
  // ENSURE EXACTLY 8 LOOT LOCATIONS: If we didn't get enough, try to find more
  // (even if they're not ideal, we need 8 total)
  while (targetsVisited < maxTargets && currentPoint) {
    const remainingCandidates = allCandidates.filter(c => {
      if (c.type === 'arc') {
        return !visitedARCs.has(c.id) && !c.isDangerous;
      }
      return !visited.has(c.id) && !c.isDangerous;
    });
    
    if (remainingCandidates.length === 0) break; // No more candidates available
    
    // Find closest remaining candidate (fallback to ensure we get 8)
    remainingCandidates.sort((a, b) => {
      const distA = calculateDistance(currentPoint!, a.coordinates);
      const distB = calculateDistance(currentPoint!, b.coordinates);
      // Prefer candidates closer to extraction
      const distToExtA = primaryExtraction ? calculateDistance(a.coordinates, primaryExtraction) : Infinity;
      const distToExtB = primaryExtraction ? calculateDistance(b.coordinates, primaryExtraction) : Infinity;
      // Combine distance and extraction proximity
      return (distA + distToExtA * 0.5) - (distB + distToExtB * 0.5);
    });
    
    const fallbackTarget = remainingCandidates[0];
    if (!fallbackTarget) break;
    
    const travelTime = calculateDistance(currentPoint, fallbackTarget.coordinates) / averageSpeed;
    timeSpent += travelTime;
    
    let instruction = fallbackTarget.type === 'arc' 
      ? `Kill ARC: ${fallbackTarget.name}`
      : `Loot ${fallbackTarget.name}`;
    
    const waypoint: PathWaypoint = {
      id: fallbackTarget.id,
      name: fallbackTarget.name,
      coordinates: fallbackTarget.coordinates,
      type: fallbackTarget.type as 'spawn' | 'cache' | 'extraction' | 'raider-key' | 'arc' | 'other',
      order: currentOrder++,
      instruction,
      distanceToExtraction: fallbackTarget.distanceToExtraction,
      isNearExtraction: fallbackTarget.isNearExtraction,
      dangerLevel: fallbackTarget.dangerLevel,
      dangerReasons: fallbackTarget.dangerReasons,
    };
    
    if (fallbackTarget.type === 'arc' && 'arcDifficulty' in fallbackTarget) {
      waypoint.arcDifficulty = fallbackTarget.arcDifficulty as 'easy' | 'medium' | 'hard' | 'extreme';
    }
    
    path.push(waypoint);
    
    if (fallbackTarget.type === 'arc') {
      visitedARCs.add(fallbackTarget.id);
    } else {
      visited.add(fallbackTarget.id);
    }
    
    currentPoint = fallbackTarget.coordinates;
    targetsVisited++;
    distToExt = currentPoint ? calculateDistance(currentPoint, primaryExtraction) : Infinity;
  }

  // End at extraction - ensure extraction is always waypoint #10
  if (options.endAtExtraction && primaryExtraction) {
    const spawnCount = path.filter(wp => wp.type === 'spawn').length;
    const lootCount = path.filter(wp => wp.type === 'cache' || wp.type === 'arc').length;
    
    // Ensure we have exactly maxTargets loot locations (trim if too many, stop if too few)
    if (lootCount > maxTargets) {
      // Keep spawn and first maxTargets loot locations, remove extras
      const spawnWaypoint = path.find(wp => wp.type === 'spawn');
      const lootWaypoints = path.filter(wp => wp.type === 'cache' || wp.type === 'arc').slice(0, maxTargets);
      path.length = 0;
      if (spawnWaypoint) path.push(spawnWaypoint);
      path.push(...lootWaypoints);
      // Recalculate orders
      path.forEach((wp, i) => { wp.order = i; });
      currentOrder = path.length;
    }
    
    const extraction = extractionPoints.find(ep => 
      ep.coordinates && 
      calculateDistance(ep.coordinates, primaryExtraction) < 1
    ) || extractionPoints[0];

    if (extraction?.coordinates) {
      const extractionType = primaryExtractionIsRaiderKey ? 'raider-key' : 'extraction';
      const extractionName = extraction.name + (primaryExtractionIsRaiderKey ? ' (Raider Key)' : '');
      
      // Ensure extraction is always waypoint #10 (order 9, index 9)
      // Path should be: 1 spawn + maxTargets loot = 9 waypoints, then extraction = 10th
      const targetOrder = 9; // Waypoint #10 (0-indexed is 9)
      
      // If path is shorter than 9 waypoints, extraction will still be added but may not be exactly #10
      // If path is longer, trim to ensure extraction is #10
      if (path.length > targetOrder) {
        // Trim to exactly 9 waypoints (1 spawn + 8 loot)
        const spawnWaypoint = path.find(wp => wp.type === 'spawn');
        const lootWaypoints = path.filter(wp => wp.type === 'cache' || wp.type === 'arc').slice(0, maxTargets);
        path.length = 0;
        if (spawnWaypoint) path.push(spawnWaypoint);
        path.push(...lootWaypoints);
        path.forEach((wp, i) => { wp.order = i; });
      }
      
      // Add extraction point as waypoint #10 (order 9)
      path.push({
        id: extraction.id,
        name: extraction.name,
        coordinates: extraction.coordinates,
        type: extractionType,
        order: targetOrder, // Always waypoint #10
        instruction: `EXFIL: Extract at ${extractionName}`,
        distanceToExtraction: 0,
        isNearExtraction: true,
        dangerLevel: 'low',
      });
    }
  }

  // Calculate arrival times and player interception risks
  if (avoidInterception && allSpawnPoints && allSpawnPoints.length > 0 && path.length > 0) {
    const userSpawn = userSpawnCoords;
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

  // IMPROVED: Try multiple strategies and pick the best one for extraction-aware
  if (algorithm === 'extraction-aware') {
    // Generate path with improved logic
    waypoints = generateExtractionAwarePath(
      spawnPoints, 
      cachePOIs, 
      extractionPoints, 
      dangerousPOIs,
      arcs,
      options,
      spawnPoints // Pass all spawn points for player avoidance
    );
    
    // If we got a path, try to improve it by checking if we can optimize clusters
    if (waypoints.length > 0 && options.maxCaches && options.maxCaches <= 15) {
      // For smaller paths, try a cluster-optimized version
      const clusterOptimizedOptions = { ...options, algorithm: 'extraction-aware' as const };
      const clusterPath = generateExtractionAwarePath(
        spawnPoints,
        cachePOIs,
        extractionPoints,
        dangerousPOIs,
        arcs,
        clusterOptimizedOptions,
        spawnPoints
      );
      
      // Compare paths and use the better one (shorter distance, more loot, safer)
      if (clusterPath.length > 0) {
        const originalDistance = calculatePathDistance(waypoints);
        const clusterDistance = calculatePathDistance(clusterPath);
        const originalLoot = waypoints.filter(wp => wp.type === 'cache' || wp.type === 'arc').length;
        const clusterLoot = clusterPath.filter(wp => wp.type === 'cache' || wp.type === 'arc').length;
        
        // Prefer cluster path if it has similar loot but shorter distance, or more loot
        if ((clusterLoot >= originalLoot && clusterDistance < originalDistance * 1.1) || 
            (clusterLoot > originalLoot && clusterDistance < originalDistance * 1.2)) {
          waypoints = clusterPath;
        }
      }
    }
  } else {
    switch (algorithm) {
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
          spawnPoints
        );
    }
  }

  if (waypoints.length === 0) {
    return null;
  }

  // Ensure first waypoint is clearly marked as INFILL/start
  const firstWaypoint = waypoints[0];
  if (firstWaypoint) {
    firstWaypoint.type = 'spawn';
    if (!firstWaypoint.name?.toLowerCase().includes('infill')) {
      const baseName = firstWaypoint.name && firstWaypoint.name !== 'Your Position'
        ? firstWaypoint.name
        : 'Entry Point';
      firstWaypoint.name = `INFILL: ${baseName}`;
    }
    if (!firstWaypoint.instruction || !firstWaypoint.instruction.toUpperCase().includes('INFILL')) {
      const baseInstruction = firstWaypoint.instruction || 'Begin from your insertion point.';
      firstWaypoint.instruction = `INFILL: ${baseInstruction}`;
    }
  }

  // Ensure final waypoint is explicitly marked as EXFIL/extraction and is waypoint #10
  const lastWaypoint = waypoints[waypoints.length - 1];
  if (lastWaypoint) {
    if (lastWaypoint.type !== 'extraction' && lastWaypoint.type !== 'raider-key') {
      lastWaypoint.type = 'extraction';
    }
    if (!lastWaypoint.name?.toLowerCase().includes('exfil')) {
      const baseName = lastWaypoint.name || 'Extraction';
      lastWaypoint.name = `EXFIL: ${baseName}`;
    }
    if (!lastWaypoint.instruction || !lastWaypoint.instruction.toUpperCase().includes('EXFIL')) {
      const baseInstruction = lastWaypoint.instruction || 'Extract safely.';
      lastWaypoint.instruction = `EXFIL: ${baseInstruction}`;
    }
    // Ensure extraction is always waypoint #10 (order 9)
    lastWaypoint.order = 9;
  }
  
  // Re-number all waypoints to ensure correct order (0-indexed, so waypoint #10 is order 9)
  waypoints.forEach((wp, index) => {
    wp.order = index;
  });
  
  // Ensure extraction is at index 9 (waypoint #10)
  if (waypoints.length > 9) {
    // Move extraction to position 9 if it's not already there
    const extractionIndex = waypoints.findIndex(wp => wp.type === 'extraction' || wp.type === 'raider-key');
    if (extractionIndex !== -1 && extractionIndex !== 9) {
      const extraction = waypoints.splice(extractionIndex, 1)[0];
      waypoints.splice(9, 0, extraction);
    }
  }
  
  // Re-number again after potential reordering
  waypoints.forEach((wp, index) => {
    wp.order = index;
  });

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
    
    // Show waypoint spawn analysis
    if (risk.waypointSpawnAnalysis && risk.waypointSpawnAnalysis.length > 0) {
      output += `📊 SPAWN ANALYSIS BY WAYPOINT:\n`;
      output += `   Shows closest spawn point and when they could arrive at each location\n\n`;
      
      for (const analysis of risk.waypointSpawnAnalysis.slice(0, 8)) { // Show first 8 waypoints
        const yourMin = Math.floor(analysis.yourArrivalTime / 60);
        const yourSec = Math.round(analysis.yourArrivalTime % 60);
        const theirMin = Math.floor(analysis.closestSpawn.theirArrivalTime / 60);
        const theirSec = Math.round(analysis.closestSpawn.theirArrivalTime % 60);
        
        output += `   📍 ${analysis.waypointName} (Step ${analysis.waypointIndex + 1}):\n`;
        output += `      Your arrival: ${yourMin}m ${yourSec}s\n`;
        output += `      Closest spawn: ${analysis.closestSpawn.spawnName || 'Unknown'} `;
        output += `(${analysis.closestSpawn.distance.toFixed(1)} units away)\n`;
        output += `      Their arrival: ${theirMin}m ${theirSec}s `;
        if (analysis.closestSpawn.canBeatYou) {
          output += `🔴 (CAN INTERCEPT)\n`;
        } else {
          const timeDiff = analysis.yourArrivalTime - analysis.closestSpawn.theirArrivalTime;
          const diffMin = Math.floor(timeDiff / 60);
          const diffSec = Math.round(timeDiff % 60);
          output += `✅ (${diffMin}m ${diffSec}s after you)\n`;
        }
      }
      output += `\n`;
    }
    
    if (risk.lateSpawnWarnings && risk.lateSpawnWarnings.length > 0) {
      output += `🟡 LATE SPAWN WARNINGS (16-20 minutes):\n`;
      output += `   Late spawns can occur between 16-20 minutes into the round\n\n`;
      
      // Group by spawn time to avoid duplicates
      const warningsByTime = new Map<number, typeof risk.lateSpawnWarnings>();
      for (const warning of risk.lateSpawnWarnings) {
        const timeKey = Math.round(warning.spawnTime / 60) * 60; // Round to nearest minute
        if (!warningsByTime.has(timeKey)) {
          warningsByTime.set(timeKey, []);
        }
        warningsByTime.get(timeKey)!.push(warning);
      }
      
      let shownCount = 0;
      for (const [spawnTime, warnings] of Array.from(warningsByTime.entries()).sort((a, b) => a[0] - b[0])) {
        if (shownCount >= 5) break; // Show max 5 different spawn times
        
        const spawnMin = Math.floor(spawnTime / 60);
        const spawnSec = Math.round(spawnTime % 60);
        
        // Show the closest spawn for this time
        const closestWarning = warnings.reduce((closest, w) => 
          w.theirPath.distance < closest.theirPath.distance ? w : closest
        );
        
        const yourMin = Math.floor(closestWarning.yourLocation.time / 60);
        const yourSec = Math.round(closestWarning.yourLocation.time % 60);
        const theirMin = Math.floor(closestWarning.theirPath.time / 60);
        const theirSec = Math.round(closestWarning.theirPath.time % 60);
        const arrivalMin = spawnMin + theirMin;
        const arrivalSec = spawnSec + theirSec;
        const finalMin = arrivalMin + Math.floor(arrivalSec / 60);
        const finalSec = arrivalSec % 60;
        
        output += `   📍 Late spawn at ${spawnMin}m ${spawnSec}s:\n`;
        output += `      Your location: ${closestWarning.yourLocation.waypointName} `;
        output += `(Step ${closestWarning.yourLocation.waypointIndex + 1})\n`;
        output += `      Your arrival time: ${yourMin}m ${yourSec}s\n`;
        output += `      Closest spawn: ${closestWarning.theirPath.spawnName || 'Unknown'} `;
        output += `(${closestWarning.theirPath.distance.toFixed(1)} units away)\n`;
        output += `      Their travel time: ${theirMin}m ${theirSec}s\n`;
        output += `      ⚠️  They could reach you by ${finalMin}m ${finalSec}s `;
        output += `(${Math.round(closestWarning.theirPath.distance)} units)\n\n`;
        
        shownCount++;
      }
      output += `   💡 Be aware of late spawns and their potential paths to your location.\n\n`;
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

