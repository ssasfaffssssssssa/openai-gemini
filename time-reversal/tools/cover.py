from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
SERIF = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'
SERIF_SB = '/usr/share/fonts/opentype/noto/NotoSerifCJK-SemiBold.ttc'
base = Image.open('build/stills/t1.25.png').convert('RGB')
W, H = base.size
a = np.asarray(base).astype(np.float32) / 255
yy, xx = np.mgrid[0:H, 0:W]
# darken the lower band and the corners so the type reads
band = np.clip((yy - H * 0.52) / (H * 0.38), 0, 1) ** 1.3
r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
vig = np.clip((r - 0.65) / 0.7, 0, 1)
a *= (1 - 0.82 * band)[..., None] * (1 - 0.55 * vig)[..., None]
img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).convert('RGBA')

def text(s, size, y, fill, glow, font=SERIF, spacing=10):
    f = ImageFont.truetype(font, size)
    d = ImageDraw.Draw(img)
    widths = [d.textlength(ch, font=f) for ch in s]
    total = sum(widths) + spacing * (len(s) - 1)
    x = (W - total) / 2
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    cx = x
    for ch, w in zip(s, widths):
        sd.text((cx, y + 4), ch, font=f, fill=(0, 0, 0, 230))
        ld.text((cx, y), ch, font=f, fill=fill)
        cx += w + spacing
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10)))
    g = layer.copy()
    tint = Image.new('RGBA', (W, H), glow)
    g = Image.composite(tint, Image.new('RGBA', (W, H), (0, 0, 0, 0)), layer.split()[3]).filter(ImageFilter.GaussianBlur(14))
    img.alpha_composite(g)
    img.alpha_composite(layer)

text('我会找到逆转时间的公式', 92, H - 330, (255, 250, 242, 255), (255, 200, 140, 170))
text('然后，回到你身边', 58, H - 196, (255, 214, 206, 255), (255, 130, 160, 170), font=SERIF_SB, spacing=12)
f = ImageFont.truetype('/usr/share/fonts/truetype/cmu/cmunti.ttf', 40)
d = ImageDraw.Draw(img)
tag = 't  →  −t'
tw = d.textlength(tag, font=f)
d.text(((W - tw) / 2, H - 110), tag, font=f, fill=(255, 225, 190, 210))
img.convert('RGB').save('build/cover_1920x1080.jpg', quality=94)
img.convert('RGB').crop(((W - 1440) // 2, 0, (W + 1440) // 2, H)).resize((720, 540)).save('build/cover_4x3_check.jpg', quality=90)
