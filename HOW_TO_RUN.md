# How to Run the Loot Run Generator

## Option 1: Run from Local Repository (Current Setup)

Since you have the repository cloned locally, you need to build it first:

### Step 1: Install Dependencies
```bash
cd arc-raiders-wrapper
npm install
```

### Step 2: Build the Project
```bash
npm run build
```

### Step 3: Run the CLI
```bash
# Basic usage
node dist/cli/index.js loot-run dam

# With options
node dist/cli/index.js loot-run spaceport --max-caches 10 --avoid-dangerous

# With your spawn coordinates
node dist/cli/index.js loot-run dam --spawn-x 100.5 --spawn-y 200.3 --spawn-z 15.2
```

## Option 2: Use npx (If Published to npm)

If the package is published to npm, you can run it directly:

```bash
npx @justinjd00/arc-raiders-api loot-run dam
```

## Option 3: Install Globally

```bash
npm install -g @justinjd00/arc-raiders-api
arc-raiders loot-run dam
```

## Option 4: Use as a Node.js Script

Create a file `run-loot.js`:

```javascript
const { createArcRaidersClient } = require('./arc-raiders-wrapper/dist/index.js');

async function main() {
  const client = createArcRaidersClient();
  
  const lootRun = await client.generateLootRunForMap('dam', {
    startAtSpawn: true,
    endAtExtraction: true,
    maxCaches: 10,
    avoidDangerousAreas: true,
    useRaiderKey: false,
  });
  
  if (lootRun) {
    console.log(client.formatLootRunPath(lootRun));
  }
}

main().catch(console.error);
```

Then run:
```bash
node run-loot.js
```

## Quick Test

To test if everything works:

```bash
cd arc-raiders-wrapper
npm install
npm run build
node dist/cli/index.js loot-run dam
```

## Available Maps

- `dam`
- `spaceport`
- `buried-city`
- `blue-gate`

## Common Commands

```bash
# Basic loot run
node dist/cli/index.js loot-run dam

# Safe run with danger avoidance
node dist/cli/index.js loot-run spaceport --avoid-dangerous

# Custom spawn position
node dist/cli/index.js loot-run dam --spawn-x 100 --spawn-y 200 --spawn-z 15

# Use raider key extraction
node dist/cli/index.js loot-run buried-city --use-raider-key

# Limited caches and time
node dist/cli/index.js loot-run dam --max-caches 8 --max-time 240

# All options
node dist/cli/index.js loot-run spaceport \
  --max-caches 10 \
  --max-time 300 \
  --avoid-dangerous \
  --use-raider-key \
  --danger-radius 75 \
  --spawn-x 100.5 \
  --spawn-y 200.3 \
  --spawn-z 15.2
```

## Troubleshooting

**Error: Cannot find module**
- Make sure you ran `npm install` and `npm run build`

**Error: Command not found**
- Use `node dist/cli/index.js` instead of just `arc-raiders` when running locally

**No loot run generated**
- The map might not have loot cache data in the API
- Try a different map name

**API errors**
- Check your internet connection
- The API might be down or rate-limiting

