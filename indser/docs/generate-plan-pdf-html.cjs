const fs = require('fs');
const mdPath = 'C:\\Users\\Ronit\\Downloads\\Isekai\\indser\\docs\\CHALLENGE_EXECUTION_PLAN.md';
const htmlPath = 'C:\\Users\\Ronit\\Downloads\\Isekai\\indser\\docs\\CHALLENGE_EXECUTION_PLAN.html';
const md = fs.readFileSync(mdPath, 'utf8');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
let out = '', inCode = false, codeLang = '', codeLines = [], inUl = false, inOl = false;
const closeLists = () => { if (inUl) { out += '</ul>'; inUl = false; } if (inOl) { out += '</ol>'; inOl = false; } };
for (const raw of md.split(/\r?\n/)) {
  const line = raw.trimEnd();
  if (line.startsWith('```')) {
    if (!inCode) { closeLists(); inCode = true; codeLang = line.slice(3).trim(); codeLines = []; }
    else { out += `<pre><code class="language-${esc(codeLang)}">${esc(codeLines.join('\n'))}</code></pre>`; inCode = false; }
    continue;
  }
  if (inCode) { codeLines.push(raw); continue; }
  if (!line.trim()) { closeLists(); continue; }
  const h = line.match(/^(#{1,6})\s+(.+)$/);
  if (h) { closeLists(); const n = h[1].length; out += `<h${n}>${inline(h[2])}</h${n}>`; continue; }
  const ul = line.match(/^\s*-\s+(.+)$/);
  if (ul) {
    if (inOl) { out += '</ol>'; inOl = false; }
    if (!inUl) { out += '<ul>'; inUl = true; }
    const checked = ul[1].match(/^\[([ xX])\]\s*(.*)$/);
    out += checked ? `<li class="check">${checked[1].trim() ? '☑' : '☐'} ${inline(checked[2])}</li>` : `<li>${inline(ul[1])}</li>`;
    continue;
  }
  const ol = line.match(/^\s*\d+\.\s+(.+)$/);
  if (ol) {
    if (inUl) { out += '</ul>'; inUl = false; }
    if (!inOl) { out += '<ol>'; inOl = true; }
    out += `<li>${inline(ol[1])}</li>`;
    continue;
  }
  if (line.startsWith('> ')) { closeLists(); out += `<blockquote>${inline(line.slice(2))}</blockquote>`; continue; }
  closeLists(); out += `<p>${inline(line)}</p>`;
}
closeLists();
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Kotodama Challenge Execution Plan</title><style>
@page{size:A4;margin:18mm 16mm 20mm}*{box-sizing:border-box}body{font-family:Arial,"Segoe UI",sans-serif;color:#182033;line-height:1.48;font-size:10.5pt;margin:0}h1{font-size:25pt;color:#5b2a86;border-bottom:3px solid #d8b4fe;padding-bottom:8px;margin:0 0 18px}h2{font-size:17pt;color:#6b21a8;margin:24px 0 10px;page-break-after:avoid;border-bottom:1px solid #e9d5ff;padding-bottom:4px}h3{font-size:13pt;color:#7e22ce;margin:18px 0 7px;page-break-after:avoid}p{margin:6px 0}ul,ol{margin:6px 0 10px 22px;padding:0}li{margin:3px 0}strong{color:#111827}code{font-family:Consolas,monospace;background:#f3e8ff;padding:1px 4px;border-radius:3px}pre{white-space:pre-wrap;background:#171126;color:#f5e9ff;padding:12px;border-radius:7px;font-size:8.5pt;page-break-inside:avoid}pre code{background:none;padding:0;color:inherit}blockquote{margin:12px 0;padding:10px 14px;border-left:4px solid #9333ea;background:#faf5ff;font-size:12pt;font-weight:600;color:#581c87}.check{list-style:none;margin-left:-18px}h1,h2,h3,blockquote,pre{break-inside:avoid}body:after{content:"Kotodama • Visko Orbis Challenge • September 2026";position:fixed;bottom:-13mm;left:0;right:0;text-align:center;font-size:8pt;color:#777}</style></head><body>${out}</body></html>`;
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(htmlPath);
