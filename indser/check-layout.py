import pathlib, subprocess, tempfile, json, re, html
base=pathlib.Path(__file__).resolve().parent
source=(base/'yume-slides.html').read_text(encoding='utf-8')
audit=r'''<script>
const results=[];for(let i=0;i<6;i++){show(i);const visible=[...document.querySelectorAll('.ys-slide')].filter(el=>getComputedStyle(el).display!=='none');if(visible.length!==1)throw Error('Visibility regression');const slide=visible[0],r=slide.getBoundingClientRect();const clipped=[...slide.querySelectorAll('h1,p,img,figure,.ys-demo-board,.ys-flow,.ys-stack-grid')].filter(el=>{const b=el.getBoundingClientRect();return b.left<r.left-1||b.top<r.top-1||b.right>r.right+1||b.bottom>r.bottom+1});results.push({slide:i+1,visible:visible.length,clipped:clipped.map(el=>el.className||el.tagName)});}show(0);document.getElementById('next').click();if(index!==1)throw Error('Next failed');document.getElementById('prev').click();if(index!==0)throw Error('Previous failed');document.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));if(index!==5)throw Error('Keyboard failed');toggleNotes();if(notes.hidden)throw Error('Notes failed');clean();if(!notes.hidden||getComputedStyle(document.getElementById('controls')).display!=='none')throw Error('Clean view failed');const out=document.createElement('pre');out.id='audit-result';out.textContent=JSON.stringify({results,navigation:true,notes:true,clean:true});document.body.append(out);
</script>'''
test=base/'assets'/'layout-check.html'
test.write_text(source.replace('</body>',audit+'</body>'),encoding='utf-8')
edge=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
try:
 for size in ['1600,1000','1366,768','1920,1080','390,844']:
  run=subprocess.run([edge,'--headless','--disable-gpu','--no-first-run','--user-data-dir='+str(pathlib.Path(tempfile.gettempdir())/'yume-deck-audit'),'--window-size='+size,'--dump-dom',test.as_uri()],capture_output=True,timeout=30)
  text=run.stdout.decode('utf-8',errors='replace')
  match=re.search(r'<pre id="audit-result">(.*?)</pre>',text,re.S)
  if not match: raise RuntimeError('Browser audit missing for '+size)
  result=json.loads(html.unescape(match.group(1)))
  if any(x['clipped'] for x in result['results']): raise RuntimeError(str(result))
  print('PASS',size,'six slides, no slide-boundary clipping, navigation, keyboard, notes, clean view',flush=True)
finally:
 test.unlink(missing_ok=True)
