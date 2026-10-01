from PIL import Image, ImageDraw, ImageFont, ImageFilter
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
base = Image.open('build/stills/t2.30.png').convert('RGBA')
W, H = base.size
# darken top for text legibility
grad = Image.new('L', (1, H))
for y in range(H):
    grad.putpixel((0, y), int(max(0, 1 - y / 900) ** 1.4 * 200))
shade = Image.new('RGBA', (W, H), (20, 8, 40, 255)); shade.putalpha(grad.resize((W, H)))
img = Image.alpha_composite(base, shade)
d = ImageDraw.Draw(img)

def text(y, s, size, fill, stroke=14, grad=None):
    f = ImageFont.truetype(FONT, size)
    w = d.textlength(s, font=f)
    x = (W - w) / 2
    # soft shadow
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).text((x + 6, y + 10), s, font=f, fill=(0, 0, 0, 170), stroke_width=stroke, stroke_fill=(0, 0, 0, 170))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)))
    d.text((x, y), s, font=f, fill=fill, stroke_width=stroke, stroke_fill=(27, 15, 42))
    if grad:
        mask = Image.new('L', (W, H), 0)
        ImageDraw.Draw(mask).text((x, y), s, font=f, fill=255)
        g = Image.new('RGBA', (W, H))
        gd = ImageDraw.Draw(g)
        for yy in range(int(y), int(y + size * 1.1)):
            u = (yy - y) / (size * 1.1)
            c = tuple(int(a + (b - a) * u) for a, b in zip(grad[0], grad[1]))
            gd.line([(0, yy), (W, yy)], fill=c + (255,))
        img.paste(g, (0, 0), mask)

# pill tag
f = ImageFont.truetype(FONT, 46)
tag = '3D 卡点 · 古典乐'
tw = d.textlength(tag, font=f)
d.rounded_rectangle([(W - tw) / 2 - 34, 268, (W + tw) / 2 + 34, 344], radius=38, fill=(255, 79, 120))
d.text(((W - tw) / 2, 278), tag, font=f, fill='white')
text(380, '下班那一刻', 150, (255, 255, 255))
text(560, '我是这样回家的', 118, (255, 225, 77), grad=((255, 247, 176), (255, 184, 31)))
# bottom hook inside the 3:4 safe area
f2 = ImageFont.truetype(FONT, 64)
hook = '结局太真实了…'
hw = d.textlength(hook, font=f2)
d.rounded_rectangle([(W - hw) / 2 - 40, 1540, (W + hw) / 2 + 40, 1640], radius=24, fill=(20, 10, 36, 210))
d.text(((W - hw) / 2, 1553), hook, font=f2, fill=(255, 255, 255))
img.convert('RGB').save('build/cover_1080x1920.jpg', quality=95)
# 3:4 crop preview (what the feed grid shows)
img.convert('RGB').crop((0, 240, W, 1680)).save('build/cover_3x4_preview.jpg', quality=92)
