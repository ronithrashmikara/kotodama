import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(dir);
const dataUri=(file)=>`data:image/${path.extname(file)==='.webp'?'webp':'png'};base64,${fs.readFileSync(file).toString('base64')}`;
const image=(name)=>dataUri(path.join(dir,'assets',name+'.webp'));
const logo=(name,label)=>`<img class="ys-logo" src="${dataUri(path.join(root,'public/logos',name+'.png'))}" alt="${label} logo">`;
const illustration=(name,cls='')=>`<figure class="ys-illustration ${cls}"><img src="${image(name)}" alt="Hand-drawn Japanese dream garden illustration"><figcaption>Concept artwork · GPT Image 2.5 Sunburst on fal · not gameplay</figcaption></figure>`;
const {buildSlides}=await import('./slides-content.mjs');
const slides=buildSlides({image,logo});
const css=fs.readFileSync(path.join(dir,'whiteboard.css'),'utf8');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Yume · Six-slide presentation</title><style>${css}</style></head><body><main id="viewport"><div id="deck">${slides.map((s,i)=>`<section class="ys-slide${i===0?' is-active':''}" data-slide="${i+1}" aria-label="Slide ${i+1}: ${s.tag}" aria-hidden="${i!==0}"><header><span class="ys-eyebrow">${s.tag}</span><h1>${s.title}</h1><p class="ys-subtitle">${s.sub}</p></header><div class="ys-content">${s.body}</div><footer><span>YUME · VISKO ORBIS CHALLENGE</span><span>${String(i+1).padStart(2,'0')} / 06</span></footer><div class="ys-camera-guide">your camera</div></section>`).join('')}</div></main><aside id="notes" hidden></aside><nav id="controls" aria-label="Presentation controls"><button id="prev" aria-label="Previous slide">←</button><span id="counter" aria-live="polite"></span><button id="next" aria-label="Next slide">→</button><button id="noteBtn">Notes · N</button><button id="full">Fullscreen · F</button><button id="clean">Clean view · H</button><button id="print">Print / PDF</button></nav><script>
const data=${JSON.stringify(slides.map(({tag,time,say,cue})=>({tag,time,say,cue}))).replaceAll('<','\\u003c')};
const slides=[...document.querySelectorAll('.ys-slide')];let index=0;
const notes=document.getElementById('notes');
function resize(){const controls=document.body.classList.contains('clean')?0:72;const scale=Math.min(innerWidth/1600,Math.max(1,innerHeight-controls)/900);const deck=document.getElementById('deck');deck.style.transform='scale('+scale+')';document.getElementById('viewport').style.height=(innerHeight-controls)+'px';}
function show(n){index=Math.max(0,Math.min(slides.length-1,n));slides.forEach((s,i)=>{s.classList.toggle('is-active',i===index);s.setAttribute('aria-hidden',String(i!==index))});document.getElementById('counter').textContent=(index+1)+' / '+slides.length;notes.replaceChildren();for(const text of [data[index].time,data[index].say,'Recording direction: '+data[index].cue]){const p=document.createElement('p');p.textContent=text;notes.append(p)}history.replaceState(null,'','#'+(index+1));}
function toggleNotes(){notes.hidden=!notes.hidden;}
function clean(){document.body.classList.toggle('clean');notes.hidden=true;resize();}
async function full(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{}}
document.getElementById('prev').onclick=()=>show(index-1);document.getElementById('next').onclick=()=>show(index+1);document.getElementById('noteBtn').onclick=toggleNotes;document.getElementById('clean').onclick=clean;document.getElementById('full').onclick=full;document.getElementById('print').onclick=()=>print();
addEventListener('resize',resize);addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown',' ','PageDown'].includes(e.key)){e.preventDefault();show(index+1)}if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();show(index-1)}if(e.key==='Home')show(0);if(e.key==='End')show(slides.length-1);if(e.key.toLowerCase()==='n')toggleNotes();if(e.key.toLowerCase()==='h')clean();if(e.key.toLowerCase()==='f')full();if(e.key==='Escape'){document.body.classList.remove('clean');notes.hidden=true;resize()}});show((Number(location.hash.slice(1))||1)-1);resize();
</script></body></html>`;
fs.writeFileSync(path.join(dir,'yume-slides.html'),html);
fs.writeFileSync(path.join(dir,'slides.json'),JSON.stringify(slides.map(({body,...s})=>s),null,2));
fs.writeFileSync(path.join(dir,'SCRIPT.md'),'# Yume · Six-slide recording script\n\nTarget: approximately 3 minutes 15 seconds, including real demo pauses. Confirm the challenge duration before submission. Visual style is inspired by sampled frames from the supplied reference. Groq is the user-confirmed provider. Demo recording is deferred until the app is ready.\n\n'+slides.map((s,i)=>`## ${i+1}. ${s.title.replaceAll('<br>',' ')}\n\n**Time: ${s.time}**\n\n${s.say}\n\n**Recording direction:** ${s.cue}\n`).join('\n'));
console.log('Built 6 slides, 2 embedded Sunburst artworks, 6 stack brand logos, and matching narration.');
