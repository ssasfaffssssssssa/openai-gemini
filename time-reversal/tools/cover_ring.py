# Covers from the final image (the golden ring): clean frames rendered with ?nohud=1&nolb=1 at 57.6 s,
# saved as build/stills/ring_land.png (1920x1080, camera pulled back a little) and ring_port.png (1080x1920).
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
SERIF = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'
SERIF_SB = '/usr/share/fonts/opentype/noto/NotoSerifCJK-SemiBold.ttc'


def build(src, out, lines):
    base = Image.open(src).convert('RGB')
    W, H = base.size
    a = np.asarray(base).astype(np.float32) / 255
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    a *= (1 - 0.5 * np.clip((r - 0.7) / 0.6, 0, 1))[..., None]
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    for (s, size, y, fill, glow, font, spacing) in lines:
        f = ImageFont.truetype(font, size)
        d = ImageDraw.Draw(img)
        widths = [d.textlength(ch, font=f) for ch in s]
        x = (W - sum(widths) - spacing * (len(s) - 1)) / 2
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
        shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(shadow)
        for ch, w in zip(s, widths):
            sd.text((x, y + 4), ch, font=f, fill=(0, 0, 0, 230))
            ld.text((x, y), ch, font=f, fill=fill)
            x += w + spacing
        img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10)))
        tint = Image.new('RGBA', (W, H), glow)
        img.alpha_composite(Image.composite(tint, Image.new('RGBA', (W, H), (0, 0, 0, 0)), layer.split()[3]).filter(ImageFilter.GaussianBlur(14)))
        img.alpha_composite(layer)
    img.convert('RGB').save(out, quality=94)
    return img


WARM, WARM_G = (255, 250, 242, 255), (255, 200, 140, 170)
ROSE, ROSE_G = (255, 214, 206, 255), (255, 130, 160, 170)
build('build/stills/ring_land.png', 'build/cover_ring_1920x1080.jpg', [
    ('我会找到逆转时间的公式', 76, 818, WARM, WARM_G, SERIF, 10),
    ('然后，回到你身边', 50, 930, ROSE, ROSE_G, SERIF_SB, 12)])
build('build/stills/ring_port.png', 'build/cover_ring_1080x1920.jpg', [
    ('我会找到', 104, 250, WARM, WARM_G, SERIF, 14),
    ('逆转时间的公式', 92, 388, WARM, WARM_G, SERIF, 12),
    ('然后，回到你身边', 62, 1560, ROSE, ROSE_G, SERIF_SB, 14)])
