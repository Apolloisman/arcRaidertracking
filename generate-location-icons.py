import os
import json
from PIL import Image, ImageDraw, ImageFont

# CONFIGURATION
ICON_SIZE = (64, 64)
ICONS_DIR = "icons-pathfinding"

# CATEGORY DEFINITIONS: Name, Color (Hex), Shape, Symbol Code
CATEGORY_STYLES = {
    "enemies-arcs": ("#ef5350", "diamond", "ARC"),
    "extraction": ("#26c6da", "arrow_up", "EXIT"),
    "spawn": ("#ffffff", "arrow_down", "DROP"),
    "locked-rooms": ("#fbc02d", "padlock", "LOCK"),
    "objectives": ("#ffeb3b", "star", "OBJ"),
    "loot-containers": ("#e0e0e0", "box", "LOOT"),
    "supply-stations": ("#bdbdbd", "radio", "SUP"),
    "resources-plants": ("#66bb6a", "leaf", "BIO"),
    "other": ("#9e9e9e", "circle", "???")
}

def draw_icon(category, color, shape, text, output_path):
    """Generate a single icon with the specified style"""
    # Create transparent image
    img = Image.new('RGBA', ICON_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    w, h = ICON_SIZE
    p = 4  # Padding
    
    # Draw Background (Dark semi-transparent)
    bg_color = (20, 20, 20, 230)  # Dark Grey, almost opaque
    
    # Helper for centering
    cx, cy = w / 2, h / 2
    
    # DRAW SHAPES
    if shape == "diamond":
        coords = [(cx, p), (w-p, cy), (cx, h-p), (p, cy)]
        draw.polygon(coords, fill=bg_color, outline=color, width=3)
        
    elif shape == "circle":
        draw.ellipse([p, p, w-p, h-p], fill=bg_color, outline=color, width=3)
        
    elif shape == "box":
        draw.rectangle([p+4, p+4, w-p-4, h-p-4], fill=bg_color, outline=color, width=3)
        
    elif shape == "arrow_up":  # Extraction
        coords = [(cx, p), (w-p, cy), (cx+10, cy), (cx+10, h-p), (cx-10, h-p), (cx-10, cy), (p, cy)]
        draw.polygon(coords, fill=bg_color, outline=color, width=3)
        
    elif shape == "arrow_down":  # Spawn
        coords = [(cx, h-p), (w-p, cy), (cx+10, cy), (cx+10, p), (cx-10, p), (cx-10, cy), (p, cy)]
        draw.polygon(coords, fill=bg_color, outline=color, width=3)
        
    elif shape == "padlock":
        # Draw a simple padlock shape
        draw.rectangle([cx-12, cy-8, cx+12, cy+8], fill=bg_color, outline=color, width=3)
        draw.arc([cx-12, cy-16, cx+12, cy], 0, 180, fill=color, width=3)
        
    elif shape == "star":
        # Draw a simple star
        points = []
        for i in range(10):
            angle = i * 3.14159 / 5
            r = (w/2 - p) if i % 2 == 0 else (w/2 - p - 8)
            points.append((cx + r * 0.8 * (1 if i % 2 == 0 else 0.5) * (1 if i < 5 else -1), 
                          cy + r * 0.8 * (1 if i % 2 == 0 else 0.5) * (1 if i < 5 else -1)))
        if len(points) >= 3:
            draw.polygon(points, fill=bg_color, outline=color, width=2)
            
    elif shape == "radio":
        # Draw a radio/antenna shape
        draw.rectangle([cx-10, cy-6, cx+10, cy+6], fill=bg_color, outline=color, width=3)
        draw.line([cx, cy-6, cx, cy-12], fill=color, width=2)
        draw.line([cx-4, cy-12, cx+4, cy-12], fill=color, width=2)
        
    elif shape == "leaf":
        # Draw a simple leaf shape
        draw.ellipse([cx-10, cy-8, cx+10, cy+8], fill=bg_color, outline=color, width=3)
        draw.line([cx, cy-8, cx, cy+8], fill=color, width=2)
        
    else:  # Default (Square)
        draw.rectangle([p, p, w-p, h-p], fill=bg_color, outline=color, width=3)
    
    # ADD TEXT LABEL (Simulated Icon Graphic)
    try:
        # Try to use a better font if available
        font = ImageFont.truetype("arial.ttf", 10)
    except:
        try:
            font = ImageFont.load_default()
        except:
            font = None
    
    # Draw text centered
    if font:
        bbox = draw.textbbox((0, 0), text[:3], font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        draw.text((cx - text_width/2, cy - text_height/2), text[:3], fill=color, font=font)
    else:
        draw.text((cx-12, cy-6), text[:3], fill=color)
    
    # Save
    img.save(output_path)
    return output_path

def hex_to_rgb(hex_color):
    """Convert hex color to RGB tuple"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def generate_icons_for_category(category_folder):
    """Generate icons for all locations in a category folder"""
    category_name = os.path.basename(category_folder)
    
    if category_name not in CATEGORY_STYLES:
        print(f"⚠️  Unknown category: {category_name}, using default style")
        color, shape, text = ("#9e9e9e", "circle", "???")
    else:
        color_hex, shape, text = CATEGORY_STYLES[category_name]
        color = hex_to_rgb(color_hex)
    
    icon_names_file = os.path.join(category_folder, "icon-names.txt")
    
    if not os.path.exists(icon_names_file):
        print(f"⚠️  No icon-names.txt found in {category_folder}")
        return 0
    
    # Read icon names
    with open(icon_names_file, 'r', encoding='utf-8') as f:
        icon_names = [line.strip() for line in f if line.strip()]
    
    generated_count = 0
    
    for icon_name in icon_names:
        # Remove .png extension if present
        icon_name = icon_name.replace('.png', '')
        
        # Create output path
        output_path = os.path.join(category_folder, f"{icon_name}.png")
        
        # Skip if already exists
        if os.path.exists(output_path):
            continue
        
        try:
            draw_icon(category_name, color, shape, text, output_path)
            generated_count += 1
        except Exception as e:
            print(f"❌ Error generating {icon_name}: {e}")
    
    return generated_count

def main():
    """Main function to generate all icons"""
    if not os.path.exists(ICONS_DIR):
        print(f"❌ Icons directory not found: {ICONS_DIR}")
        print("   Please run reorganize-icons.cjs first to create the folder structure")
        return
    
    print("🎨 Generating location icons from API data...\n")
    print("=" * 70)
    
    total_generated = 0
    categories_processed = 0
    
    # Process each category folder
    for item in os.listdir(ICONS_DIR):
        category_path = os.path.join(ICONS_DIR, item)
        
        if os.path.isdir(category_path):
            print(f"\n📁 Processing {item}/...")
            count = generate_icons_for_category(category_path)
            total_generated += count
            categories_processed += 1
            if count > 0:
                print(f"   ✅ Generated {count} new icon(s)")
            else:
                print(f"   ℹ️  All icons already exist or none to generate")
    
    print("\n" + "=" * 70)
    print(f"✨ Complete! Generated {total_generated} icon(s) across {categories_processed} categories")
    print(f"📂 Icons directory: {os.path.abspath(ICONS_DIR)}")
    print("=" * 70)

if __name__ == "__main__":
    main()

