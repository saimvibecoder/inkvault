/* Inkvault worker: opens CBR/CBZ comics off the main thread so the shelf never stutters.
   Jobs: 'cover' (cover + spine thumbnail + colour), 'thumb' (thumbnail from a stored cover),
   'open' / 'page' (reader). Jobs run one at a time, in order. */
self.window = self;
importScripts('/rar.js', '/lib/jszip.min.js');

const IMG = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp' };
const mimeOf = n => MIME[n.split('.').pop().toLowerCase()] || 'image/jpeg';
const junk = n => /(^|[\/\\])__MACOSX[\/\\]/.test(n) || /^\./.test(n.split(/[\/\\]/).pop());
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const HAS_OC = typeof OffscreenCanvas !== 'undefined';

let WASM = null;
async function wasm() {
  if (!WASM) { const r = await fetch('/unrar.wasm'); if (!r.ok) throw new Error('the CBR reader could not download'); WASM = await r.arrayBuffer(); }
  return WASM;
}

async function openArchive(file, kind) {
  const data = await file.arrayBuffer();
  if (kind === 'cbr') {
    let ex;
    try { ex = await self.InkRar.createExtractorFromData({ data, wasmBinary: await wasm() }); }
    catch (e) { throw new Error('not a readable RAR archive (' + (e.reason || e.message || 'damaged') + ')'); }
    let heads;
    try { heads = [...ex.getFileList().fileHeaders]; }
    catch (e) { throw new Error('not a readable RAR archive (' + (e.reason || e.message || 'damaged') + ')'); }
    if (heads.some(h => h.flags && h.flags.encrypted)) throw new Error('it is password protected');
    const names = heads.filter(h => !(h.flags && h.flags.directory) && IMG.test(h.name) && !junk(h.name)).map(h => h.name).sort(natural);
    if (!names.length) throw new Error('no page images inside');
    const get = async name => {
      // Spread the generator fully so the archive is closed after each page (no leaked handles).
      const out = [...ex.extract({ files: [name] }).files];
      const f = out.find(x => x.extraction);
      if (!f) throw new Error('page missing');
      const blob = new Blob([f.extraction], { type: mimeOf(name) });
      delete ex.dataFiles['*Extracted*/' + name]; // free the decompressed page
      return blob;
    };
    return { names, get };
  }
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files).filter(k => IMG.test(k) && !zip.files[k].dir && !junk(k)).sort(natural);
  if (!names.length) throw new Error('no page images inside');
  return { names, get: async name => new Blob([await zip.file(name).async('arraybuffer')], { type: mimeOf(name) }) };
}

function shrinkTo(src, w) {
  const s = Math.min(1, w / src.width);
  const c = new OffscreenCanvas(Math.max(1, Math.round(src.width * s)), Math.max(1, Math.round(src.height * s)));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
function colourOf(c) {
  const px = new OffscreenCanvas(6, 6), g = px.getContext('2d');
  g.drawImage(c, 0, c.height * .15, c.width, c.height * .7, 0, 0, 6, 6);
  const d = g.getImageData(0, 0, 6, 6).data; let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4; return [r / n, gg / n, b / n].map(v => Math.round(v * .82 + 20));
}
async function images(blob, coverW) {
  if (!HAS_OC) return { raw: blob };
  const bmp = await createImageBitmap(blob);
  try {
    const out = {};
    if (coverW) { const big = shrinkTo(bmp, coverW); out.blob = await big.convertToBlob({ type: 'image/jpeg', quality: .82 }); }
    const small = shrinkTo(bmp, 120);
    out.thumb = await small.convertToBlob({ type: 'image/jpeg', quality: .8 });
    out.color = colourOf(small);
    return out;
  } finally { bmp.close && bmp.close(); }
}

let reading = null; // the comic open in the reader: { tok, arc }

async function handle(m) {
  if (m.type === 'cover') {
    const arc = await openArchive(m.file, m.kind);
    const first = await arc.get(arc.names[0]);
    return Object.assign({ pages: arc.names.length }, await images(first, m.w));
  }
  if (m.type === 'thumb') return await images(m.blob, 0);
  if (m.type === 'open') { reading = null; const arc = await openArchive(m.file, m.kind); reading = { tok: m.tok, arc }; return { count: arc.names.length }; }
  if (m.type === 'page') { if (!reading || reading.tok !== m.tok) throw new Error('stale'); return await reading.arc.get(reading.arc.names[m.i]); }
  throw new Error('unknown job');
}

let chain = Promise.resolve();
self.onmessage = e => {
  const m = e.data;
  chain = chain.then(() => handle(m)).then(
    res => self.postMessage({ id: m.id, ok: true, res }),
    err => self.postMessage({ id: m.id, ok: false, err: String((err && err.message) || err || 'unreadable file') })
  );
};
