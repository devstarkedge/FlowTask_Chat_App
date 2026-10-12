"""Verify generated adaptive resources and render analytical launcher-mask previews.

Requires Pillow. This does not modify any branding asset.
"""
from pathlib import Path
import json
import math
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
config = json.loads((root / 'app.json').read_text())['expo']
options = next(p[1] for p in config['plugins'] if isinstance(p, list) and p[0] == './plugins/withAndroidLauncherInset.cjs')
inset = options['insetPercent'] / 100
scale = 1 - 2 * inset
source = Image.open(root / config['android']['adaptiveIcon']['foregroundImage']).convert('RGBA')
assert source.size == (316, 316)
assert config['icon'] == './assets/Vector.png'
assert config['android']['adaptiveIcon']['backgroundColor'] == '#ffffff'
assert next(p[1]['image'] for p in config['plugins'] if isinstance(p, list) and p[0] == 'expo-splash-screen') == './assets/Vector.png'
ns = '{http://schemas.android.com/apk/res/android}'
res = root / 'android/app/src/main/res'
for name in ['ic_launcher', 'ic_launcher_round']:
    xml = ET.parse(res / f'mipmap-anydpi-v26/{name}.xml').getroot()
    assert xml.find('foreground').get(ns + 'drawable') == '@drawable/taskchat_launcher_foreground'
    assert xml.find('background').get(ns + 'drawable') == '@color/iconBackground'
wrapper = ET.parse(res / 'drawable/taskchat_launcher_foreground.xml').getroot()
assert wrapper.get(ns + 'drawable') == '@mipmap/ic_launcher_foreground'
for side in ['Left', 'Top', 'Right', 'Bottom']:
    assert wrapper.get(ns + 'inset' + side) == f"{options['insetPercent']}%"
colors = ET.parse(res / 'values/colors.xml').getroot()
assert next(c.text.lower() for c in colors if c.get('name') == 'iconBackground') == '#ffffff'
for density, size in [('mdpi', 108), ('hdpi', 162), ('xhdpi', 216), ('xxhdpi', 324), ('xxxhdpi', 432)]:
    assert Image.open(res / f'mipmap-{density}/ic_launcher_foreground.webp').size == (size, size)
pixels = [(x + .5 - source.width / 2, y + .5 - source.height / 2)
          for y in range(source.height) for x in range(source.width)
          if source.getpixel((x, y))[3] > 16]
radius = max(math.hypot(x, y) for x, y in pixels) * 108 / source.width
assert radius * scale <= 33, 'Important artwork extends beyond safe circle'
bbox = source.getbbox()
assert abs((bbox[0] + bbox[2]) / 2 - source.width / 2) <= 1
assert abs((bbox[1] + bbox[3]) / 2 - source.height / 2) <= 1

size, visible = 648, 432  # 108 dp layers, launcher displays central 72 dp.
def layer(fitted):
    canvas = Image.new('RGBA', (size, size), 'white')
    width = round(size * scale) if fitted else size
    art = source.resize((width, width), Image.Resampling.LANCZOS)
    canvas.alpha_composite(art, ((size-width)//2, (size-width)//2))
    edge = (size-visible)//2
    return canvas.crop((edge, edge, edge+visible, edge+visible))

sheet = Image.new('RGB', (980, 1130), '#e9edf2')
draw = ImageDraw.Draw(sheet)
draw.text((25, 14), 'TaskChat adaptive launcher - simulated masks (not device screenshots)', fill='black')
draw.text((170, 42), 'BEFORE', fill='black')
draw.text((650, 42), 'AFTER: 14% inset per side', fill='black')
for row, kind in enumerate(['circle', 'rounded-square', 'squircle', 'hexagon']):
    mask = Image.new('L', (visible, visible), 0)
    d = ImageDraw.Draw(mask)
    if kind == 'circle': d.ellipse((0, 0, visible-1, visible-1), fill=255)
    elif kind == 'rounded-square': d.rounded_rectangle((0, 0, visible-1, visible-1), radius=95, fill=255)
    elif kind == 'hexagon':
        d.polygon([(visible/2 + visible/2*math.cos(a*math.pi/3), visible/2 + visible/2*math.sin(a*math.pi/3)) for a in range(6)], fill=255)
    else:
        for y in range(visible):
            for x in range(visible):
                if abs((x+.5-visible/2)/(visible/2))**4 + abs((y+.5-visible/2)/(visible/2))**4 <= 1:
                    mask.putpixel((x, y), 255)
    fixed = layer(True)
    # All non-white logo pixels must survive each simulated launcher mask.
    for y in range(visible):
        for x in range(visible):
            if min(fixed.getpixel((x,y))[:3]) < 230:
                assert mask.getpixel((x,y)), f'{kind} clips the logo'
    for col, fitted in enumerate([False, True]):
        thumbnail = layer(fitted)
        thumbnail.putalpha(mask)
        thumbnail = thumbnail.resize((240,240), Image.Resampling.LANCZOS)
        sheet.paste(thumbnail, (100+col*490, 75+row*260), thumbnail)
    draw.text((365, 180+row*260), kind, fill='black')
out = root / '.verification-android-icon'
out.mkdir(exist_ok=True)
sheet.save(out / 'launcher-masks.png')
print(f'PASS: generated density/XML/color resources; centered source; radius {radius:.2f} -> {radius*scale:.2f} dp; all four masks retain artwork')
print(out / 'launcher-masks.png')
