import fs from 'node:fs/promises';
const assets=new URL('./assets/',import.meta.url);await fs.mkdir(assets,{recursive:true});
const images=[['dream-world','https://v3b.fal.media/files/b/0aab75fc/ptuyEnn8-U7dVnpQi0mIt_vIzDBHP8.webp'],['words-become-world','https://v3b.fal.media/files/b/0aab75fc/1oiAjMyZDe3vyYZYlRaOR_s8om0H0Q.webp']];
for(const [name,url] of images){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Download HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer());await fs.writeFile(new URL(name+'.webp',assets),bytes);console.log(name,bytes.length,'bytes');}
await fs.writeFile(new URL('provenance.json',assets),JSON.stringify({model:'openai/gpt-image-2.5/sunburst/text-to-image',provider:'fal.ai',quality:'high',requestedDimensions:{width:1280,height:960},purpose:'Concept presentation artwork, not gameplay evidence',images:images.map(([name,url])=>({name,url}))},null,2));
