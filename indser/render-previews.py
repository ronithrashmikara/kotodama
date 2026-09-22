import subprocess, pathlib, os
from PIL import Image, ImageOps, ImageDraw
base=pathlib.Path(__file__).resolve().parent
edge=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
shots=[]
for i in range(1,7):
    output=base/'assets'/f'preview-{i}.png'
    cmd=[edge,'--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--user-data-dir='+os.path.join(os.environ['TEMP'],'yume-deck-check'),'--window-size=1600,1000','--screenshot='+str(output),(base/'yume-slides.html').as_uri()+'#'+str(i)]
    result=subprocess.run(cmd,capture_output=True,timeout=25)
    if not output.exists(): raise RuntimeError('Screenshot failed for slide '+str(i))
    shots.append(output)
    print('Rendered slide',i,flush=True)
canvas=Image.new('RGB',(1600,1500),'#e9ece5')
for i,p in enumerate(shots):
    image=Image.open(p).convert('RGB').resize((800,500))
    canvas.paste(image,((i%2)*800,(i//2)*500))
canvas.save(base/'preview-all-slides.jpg',quality=92)
print('Saved six-slide contact sheet')
