import sys, glob, os
from PIL import Image, ImageDraw
files = sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
cols = min(len(ims), 5)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * h), 'black')
for i, (f, im) in enumerate(zip(files, ims)):
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
    ImageDraw.Draw(sheet).text(((i % cols) * w + 8, (i // cols) * h + 8), os.path.basename(f), fill='white')
sheet.save(sys.argv[1])
