# Quick Start Guide - Running at Round Start

## Easiest Method: Double-Click Script

### Option 1: Windows Batch File (Easiest)
1. **Double-click `quick-run.bat`**
2. Enter your map name (e.g., `dam`)
3. Enter your spawn coordinates (e.g., `3594.76 2919.88`) or press Enter to use saved spawn
4. The loot run will generate automatically!

### Option 2: PowerShell Script
1. **Right-click `quick-run.ps1`** → "Run with PowerShell"
2. Follow the prompts

## Command Line Method (Fastest)

### If you know your coordinates:
```bash
node run-loot.cjs dam 3594.76 2919.88
```

### If you want to use saved spawn:
```bash
node run-loot.cjs dam
```

### Find your location first:
```bash
node find-location.cjs dam "water treatment"
```

## Workflow at Round Start

1. **Spawn in-game**
2. **Check your coordinates** (if available in-game)
3. **Run the script:**
   - Double-click `quick-run.bat` OR
   - Run: `node run-loot.cjs <map> <x> <y>`
4. **Open the generated HTML file** (`loot-run-<map>.html`) to see the visual map
5. **Follow the step-by-step instructions** in the terminal output

## Tips

- **Save your spawn coordinates**: The script remembers your last spawn location per map
- **Use location search**: If you don't know coordinates, use `find-location.cjs` to search by name
- **Cache is persistent**: API calls are cached for 24 hours, so subsequent runs are instant
- **Map overlay**: The HTML file shows your path overlaid on the actual map image

## Keyboard Shortcut (Optional)

You can create a desktop shortcut:
1. Right-click `quick-run.bat` → "Create shortcut"
2. Move shortcut to desktop
3. (Optional) Right-click shortcut → Properties → Set a keyboard shortcut

## Example Session

```
1. Spawn at Water Treatment Elevator
2. Run: node find-location.cjs dam "water treatment"
   → Found: Water Treatment Elevator: (3594.76, 2919.88)
3. Run: node run-loot.cjs dam 3594.76 2919.88
4. Open loot-run-dam.html to see the path
5. Follow the path!
```


