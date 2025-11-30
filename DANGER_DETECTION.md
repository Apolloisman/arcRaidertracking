# Enhanced Danger Detection System

## Overview

The loot run pathfinding now uses a sophisticated danger assessment system that considers multiple factors beyond just distance from extraction.

## Danger Factors

### 1. Objectives
- **Weight**: 3 points per objective
- **Detection**: Any objective POI within the danger radius
- **Reason**: Objectives are typically high-activity areas with enemies

### 2. Multiple ARCs
- **Weight**: 2.0x per ARC (configurable)
- **Detection**: ARCs located in the same area
- **Reason**: Multiple ARCs mean more enemy activity and higher risk
- **Example**: 3 ARCs in area = 6.0 danger score

### 3. Structure Density (Poor Sight Lines)
- **Weight**: 2 points
- **Detection**: 5+ POIs within 1.5x danger radius
- **Reason**: High POI density indicates buildings/structures = bad sight lines = dangerous
- **Use Case**: Areas with many buildings are harder to navigate and see enemies

### 4. Distance from Extraction
- **Factor**: Still considered, but not the only factor
- **Reason**: Far from extraction = harder to escape if danger appears

## Danger Levels

The system calculates a danger score and assigns levels:

- **Low** (0-2 points): Safe to loot
- **Medium** (3-7 points): Some risk, be cautious
- **High** (8-14 points): Significant danger, avoid if possible
- **Extreme** (15+ points): Very dangerous, only loot if necessary

## Usage

### Basic Danger Avoidance
```bash
npx arc-raiders loot-run dam --avoid-dangerous
```

This will:
- Avoid objectives
- Consider ARC locations
- Check structure density
- Show danger levels in the output

### Custom Danger Radius
```bash
npx arc-raiders loot-run spaceport --avoid-dangerous --danger-radius 75
```

Larger radius = checks for danger further away (default: 50 units)

### ARC Danger Weight
In code, you can adjust how much multiple ARCs increase danger:
```typescript
const lootRun = await client.generateLootRunForMap('dam', {
  avoidDangerousAreas: true,
  arcDangerWeight: 3.0, // ARCs count more (default: 2.0)
  dangerRadius: 60,
});
```

## Raider Key Extraction

The system now supports raider key extraction points as an alternative to regular extraction:

```bash
npx arc-raiders loot-run dam --use-raider-key
```

This will:
- Prefer raider key extraction points
- Generate paths that end at raider key locations
- Mark extraction as "Raider Key" in the output

## Output Format

Danger information is shown in the path output:

```
📦 STEP 3: Loot Cache Beta ⚠️ HIGH: 2 objectives nearby, 1 ARC in area
   Location: Cache Beta
   Coordinates: (150.2, 180.5, 14.8)
   Distance to extraction: 120.5 units 🟡 FAR FROM EXTRACTION
   Danger: HIGH 🟠 HIGH DANGER
   Reasons: 2 objectives nearby, 1 ARC in area (2 danger)
```

## How It Works

1. **Pre-assessment**: Before generating the path, the system assesses danger for all cache locations
2. **Scoring**: Each location gets a danger score based on:
   - Number of nearby objectives
   - Number of ARCs in the area
   - POI density (structure complexity)
3. **Path Selection**: The algorithm prioritizes:
   - Near extraction (safe zones)
   - Low danger scores
   - Avoiding high/extreme danger areas when possible
4. **Display**: Each waypoint shows its danger level and reasons

## Limitations

- **ARC Location Mapping**: ARCs from the API may not have exact coordinates, so the system uses location name matching
- **Building Detection**: Uses POI density as a proxy for building presence (no direct building data)
- **Sight Lines**: Inferred from structure density, not actual line-of-sight calculations
- **Dynamic Threats**: Doesn't account for player/enemy positions (static assessment only)

## Future Enhancements

Potential improvements:
- Direct building/structure data from API
- Actual line-of-sight calculations
- Player activity heatmaps
- Real-time threat assessment
- Custom danger zones (user-defined)

