"""Side-by-side before/after composites for VISUAL_DIFF.md.

python3 scripts/compose-diff.py screenshots docs/screenshots
  - copies every screenshot to docs/screenshots/after/<name>.jpg (960 px wide)
  - writes docs/screenshots/diff/<name>.jpg (baseline left, after right) where a baseline exists
"""
import os
import sys
from PIL import Image, ImageDraw

src, docs = sys.argv[1], sys.argv[2]
base_dir = os.path.join(docs, 'baseline')
after_dir = os.path.join(docs, 'after')
diff_dir = os.path.join(docs, 'diff')
os.makedirs(after_dir, exist_ok=True)
os.makedirs(diff_dir, exist_ok=True)
W = 960
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'):
        continue
    name = f[:-4]
    im = Image.open(os.path.join(src, f)).convert('RGB')
    im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    im.save(os.path.join(after_dir, name + '.jpg'), quality=82)
    bp = os.path.join(base_dir, name + '.jpg')
    if not os.path.exists(bp):
        continue
    b = Image.open(bp).convert('RGB')
    b = b.resize((W, round(b.height * W / b.width)), Image.LANCZOS)
    h = max(b.height, im.height)
    out = Image.new('RGB', (W * 2 + 8, h + 28), (12, 14, 20))
    out.paste(b, (0, 28))
    out.paste(im, (W + 8, 28))
    d = ImageDraw.Draw(out)
    d.text((8, 8), 'baseline (Phase 2 step 0)', fill=(200, 200, 210))
    d.text((W + 16, 8), 'after (Phase 2)', fill=(200, 200, 210))
    out.save(os.path.join(diff_dir, name + '.jpg'), quality=80)
    print('diff', name)
