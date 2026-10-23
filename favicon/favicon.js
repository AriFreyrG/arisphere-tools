// Arisphere Favicon Generator. Icons are drawn on canvases in this tab and
// zipped with fflate; nothing is uploaded.
import { zipSync } from '../vendor/fflate/fflate.mjs';

const $ = (id) => document.getElementById(id);
const els = {
    modeTabs: [...document.querySelectorAll('[data-mode]')],
    forms: [...document.querySelectorAll('[data-form]')],
    text: $('text'),
    textColor: $('text-color'),
    textFont: $('text-font'),
    textWeight: $('text-weight'),
    imageFile: $('image-file'),
    gridSize: $('grid-size'),
    penColor: $('pen-color'),
    swatches: $('swatches'),
    pixelTools: [...document.querySelectorAll('[data-pixel-tool]')],
    traceFile: $('trace-file'),
    pixelUndo: $('pixel-undo'),
    pixelClear: $('pixel-clear'),
    bg: $('bg'),
    shape: $('shape'),
    transparent: $('transparent'),
    padding: $('padding'),
    paddingLabel: $('padding-label'),
    siteName: $('site-name'),
    stage: $('stage'),
    big: $('big'),
    sized: [...document.querySelectorAll('canvas[data-size]')],
    tabTitles: [$('tab-title-light'), $('tab-title-dark')],
    zip: $('download-zip'),
    ico: $('download-ico'),
    snippet: $('snippet'),
    copySnippet: $('copy-snippet'),
};

const FONTS = {
    sans: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    rounded: "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', 'Nunito', sans-serif",
};

// Arisphere colours first, then a few basics.
const PALETTE = ['#0f172a', '#ffffff', '#d97706', '#fbbf24', '#dc2626', '#059669', '#7c3aed', '#c4b5fd', '#3b82f6', '#9ca3af'];

let mode = 'text';
let image = null; // an HTMLImageElement for image mode
let grid = 16;
let pixels = new Array(16 * 16).fill(null); // hex colour or null per cell
let pixelTool = 'pen';
const pixelHistory = [];

// ---------------------------------------------------------------------------
// Drawing an icon at any size
// ---------------------------------------------------------------------------

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// Shrinks large sources in halves first, which keeps small icons from looking grainy.
function downscaled(source, sw, sh, targetMax) {
    let canvas = source;
    let w = sw;
    let h = sh;
    while (Math.max(w, h) / 2 >= targetMax) {
        const next = document.createElement('canvas');
        next.width = Math.max(1, Math.round(w / 2));
        next.height = Math.max(1, Math.round(h / 2));
        const ctx = next.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, next.width, next.height);
        canvas = next;
        w = next.width;
        h = next.height;
    }
    return canvas;
}

function pixelCanvas() {
    const c = document.createElement('canvas');
    c.width = grid;
    c.height = grid;
    const ctx = c.getContext('2d');
    pixels.forEach((colour, i) => {
        if (!colour) return;
        ctx.fillStyle = colour;
        ctx.fillRect(i % grid, Math.floor(i / grid), 1, 1);
    });
    return c;
}

// apple: iPhone icons get an opaque, square background (iOS rounds the corners itself).
function renderIcon(size, { apple = false } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const radius = apple ? 0 : (Number(els.shape.value) * size) / 2;

    if (radius > 0) {
        roundedRect(ctx, 0, 0, size, size, radius);
        ctx.clip();
    }
    if (!els.transparent.checked || apple) {
        ctx.fillStyle = els.bg.value;
        ctx.fillRect(0, 0, size, size);
    }

    // Apple icons get extra room so the artwork isn't cramped by the rounded mask.
    const padFraction = Number(els.padding.value) / 100 + (apple && els.transparent.checked ? 0.08 : 0);
    const pad = Math.round(size * padFraction);
    const box = size - pad * 2;

    if (mode === 'text') {
        drawText(ctx, size, box);
    } else if (mode === 'image' && image) {
        const scale = Math.min(box / image.naturalWidth, box / image.naturalHeight);
        const w = image.naturalWidth * scale;
        const h = image.naturalHeight * scale;
        const src = downscaled(image, image.naturalWidth, image.naturalHeight, Math.max(w, h));
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, (size - w) / 2, (size - h) / 2, w, h);
    } else if (mode === 'pixel') {
        // Whole-number scaling keeps pixel art crisp; only shrink smoothly if it can't fit.
        const k = Math.floor(box / grid);
        const art = pixelCanvas();
        if (k >= 1) {
            ctx.imageSmoothingEnabled = false;
            const w = grid * k;
            ctx.drawImage(art, Math.floor((size - w) / 2), Math.floor((size - w) / 2), w, w);
        } else {
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(art, pad, pad, box, box);
        }
    }
    return canvas;
}

function drawText(ctx, size, box) {
    const text = els.text.value.trim();
    if (!text) return;
    const family = FONTS[els.textFont.value];
    const weight = els.textWeight.value;
    // Measure at a reference size, then scale so the ink fills the box.
    const ref = 100;
    ctx.font = `${weight} ${ref}px ${family}`;
    const m = ctx.measureText(text);
    const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (!inkW || !inkH) return;
    const scale = Math.min(box / inkW, box / inkH);
    const fontSize = ref * scale;
    ctx.font = `${weight} ${fontSize}px ${family}`;
    ctx.fillStyle = els.textColor.value;
    ctx.textBaseline = 'alphabetic';
    const x = size / 2 - ((m.actualBoundingBoxRight - m.actualBoundingBoxLeft) * scale) / 2;
    const y = size / 2 + ((m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) * scale) / 2;
    ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function render() {
    els.paddingLabel.textContent = `${els.padding.value}%`;
    const name = els.siteName.value.trim() || 'My Website';
    for (const t of els.tabTitles) t.textContent = name;

    for (const c of els.sized) {
        const size = Number(c.dataset.size);
        const icon = renderIcon(size, { apple: c.hasAttribute('data-apple') });
        c.width = size;
        c.height = size;
        if (!c.hasAttribute('data-tab') && size !== 180) {
            c.style.width = `${size}px`;
            c.style.height = `${size}px`;
        }
        c.getContext('2d').drawImage(icon, 0, 0);
    }

    els.stage.classList.toggle('is-pixel', mode === 'pixel');
    const big = els.big;
    const ctx = big.getContext('2d');
    if (mode === 'pixel') {
        drawPixelEditor(ctx);
    } else {
        ctx.clearRect(0, 0, big.width, big.height);
        ctx.drawImage(renderIcon(big.width), 0, 0);
    }

    const empty = (mode === 'image' && !image) || (mode === 'text' && !els.text.value.trim());
    els.zip.disabled = empty;
    els.ico.disabled = empty;
    els.snippet.textContent = snippet();
}

function drawPixelEditor(ctx) {
    const size = els.big.width;
    const cell = size / grid;
    ctx.clearRect(0, 0, size, size);
    if (!els.transparent.checked) {
        ctx.fillStyle = els.bg.value;
        ctx.fillRect(0, 0, size, size);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pixelCanvas(), 0, 0, size, size);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < grid; i++) {
        const p = Math.round(i * cell) + 0.5;
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
    }
    ctx.stroke();
}

// ---------------------------------------------------------------------------
// Pixel art editing
// ---------------------------------------------------------------------------

function pushPixels() {
    pixelHistory.push({ grid, pixels: [...pixels] });
    if (pixelHistory.length > 100) pixelHistory.shift();
    els.pixelUndo.disabled = false;
}

function cellAt(e) {
    const rect = els.big.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * grid);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * grid);
    if (x < 0 || y < 0 || x >= grid || y >= grid) return -1;
    return y * grid + x;
}

function floodFill(start, colour) {
    const target = pixels[start];
    if (target === colour) return;
    const stack = [start];
    while (stack.length) {
        const i = stack.pop();
        if (pixels[i] !== target) continue;
        pixels[i] = colour;
        const x = i % grid;
        if (x > 0) stack.push(i - 1);
        if (x < grid - 1) stack.push(i + 1);
        if (i >= grid) stack.push(i - grid);
        if (i < grid * grid - grid) stack.push(i + grid);
    }
}

let painting = null; // { colour } while the pointer is down

els.big.addEventListener('pointerdown', (e) => {
    if (mode !== 'pixel') return;
    e.preventDefault();
    const i = cellAt(e);
    if (i < 0) return;
    const erase = pixelTool === 'eraser' || e.button === 2 || e.shiftKey;
    const colour = erase ? null : els.penColor.value;
    pushPixels();
    if (pixelTool === 'fill' && !erase) {
        floodFill(i, colour);
        render();
        return;
    }
    painting = { colour };
    pixels[i] = colour;
    els.big.setPointerCapture(e.pointerId);
    render();
});

els.big.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const i = cellAt(e);
    if (i < 0 || pixels[i] === painting.colour) return;
    pixels[i] = painting.colour;
    render();
});

const stopPainting = () => { painting = null; };
els.big.addEventListener('pointerup', stopPainting);
els.big.addEventListener('pointercancel', stopPainting);
els.big.addEventListener('contextmenu', (e) => {
    if (mode === 'pixel') e.preventDefault();
});

function setGrid(next, keep = true) {
    const old = { grid, pixels };
    grid = next;
    pixels = new Array(grid * grid).fill(null);
    if (keep) {
        // Scale the existing drawing to the new grid.
        for (let y = 0; y < grid; y++) {
            for (let x = 0; x < grid; x++) {
                const ox = Math.floor((x * old.grid) / grid);
                const oy = Math.floor((y * old.grid) / grid);
                pixels[y * grid + x] = old.pixels[oy * old.grid + ox];
            }
        }
    }
    els.gridSize.value = String(grid);
}

els.gridSize.addEventListener('change', () => {
    pushPixels();
    setGrid(Number(els.gridSize.value));
    render();
});

els.pixelUndo.addEventListener('click', () => {
    const last = pixelHistory.pop();
    if (!last) return;
    grid = last.grid;
    pixels = last.pixels;
    els.gridSize.value = String(grid);
    els.pixelUndo.disabled = !pixelHistory.length;
    render();
});

els.pixelClear.addEventListener('click', () => {
    pushPixels();
    pixels.fill(null);
    render();
});

for (const b of els.pixelTools) {
    b.addEventListener('click', () => {
        pixelTool = b.dataset.pixelTool;
        for (const o of els.pixelTools) o.setAttribute('aria-selected', String(o === b));
    });
}

function setPen(colour) {
    els.penColor.value = colour;
    for (const s of els.swatches.children) s.setAttribute('aria-pressed', String(s.dataset.colour === colour));
}

for (const colour of PALETTE) {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = colour;
    b.dataset.colour = colour;
    b.title = colour;
    b.setAttribute('aria-label', `Colour ${colour}`);
    b.addEventListener('click', () => setPen(colour));
    els.swatches.append(b);
}
els.penColor.addEventListener('input', () => setPen(els.penColor.value));

// Turns an image into pixel art by shrinking it to the grid.
async function trace(file) {
    const img = await loadImage(file);
    if (!img) return;
    const c = document.createElement('canvas');
    c.width = grid;
    c.height = grid;
    const ctx = c.getContext('2d');
    const scale = Math.min(grid / img.naturalWidth, grid / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(downscaled(img, img.naturalWidth, img.naturalHeight, grid), (grid - w) / 2, (grid - h) / 2, w, h);
    const data = ctx.getImageData(0, 0, grid, grid).data;
    pushPixels();
    for (let i = 0; i < grid * grid; i++) {
        const [r, g, b, a] = data.slice(i * 4, i * 4 + 4);
        pixels[i] = a < 128 ? null : `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }
    render();
}

// ---------------------------------------------------------------------------
// Files in and out
// ---------------------------------------------------------------------------

async function loadImage(file) {
    if (!file) return null;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
        await img.decode();
    } catch {
        URL.revokeObjectURL(url);
        alert('That image could not be read.');
        return null;
    }
    // SVGs without a size report 0; give them one so they can be drawn.
    if (!img.naturalWidth) {
        img.width = 512;
        img.height = 512;
    }
    return img;
}

const canvasPng = (canvas) => new Promise((resolve) => canvas.toBlob(async (blob) => resolve(new Uint8Array(await blob.arrayBuffer())), 'image/png'));

// An .ico file holding PNG images, which every current browser reads.
async function buildIco(sizes) {
    const images = await Promise.all(sizes.map((s) => canvasPng(renderIcon(s))));
    const headerSize = 6 + sizes.length * 16;
    const total = headerSize + images.reduce((n, img) => n + img.length, 0);
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, sizes.length, true);
    let offset = headerSize;
    sizes.forEach((size, i) => {
        const entry = 6 + i * 16;
        view.setUint8(entry, size >= 256 ? 0 : size);
        view.setUint8(entry + 1, size >= 256 ? 0 : size);
        view.setUint8(entry + 2, 0);
        view.setUint8(entry + 3, 0);
        view.setUint16(entry + 4, 1, true);
        view.setUint16(entry + 6, 32, true);
        view.setUint32(entry + 8, images[i].length, true);
        view.setUint32(entry + 12, offset, true);
        out.set(images[i], offset);
        offset += images[i].length;
    });
    return out;
}

function manifest() {
    const name = els.siteName.value.trim();
    const colour = els.transparent.checked ? '#ffffff' : els.bg.value;
    return JSON.stringify({
        ...(name && { name, short_name: name }),
        icons: [
            { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
        theme_color: colour,
        background_color: colour,
        display: 'standalone',
    }, null, 2);
}

function snippet() {
    return [
        '<link rel="icon" href="/favicon.ico" sizes="48x48">',
        '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
        '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
        '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
        '<link rel="manifest" href="/site.webmanifest">',
    ].join('\n');
}

function save(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

els.zip.addEventListener('click', async () => {
    els.zip.disabled = true;
    const [ico, p16, p32, apple, p192, p512] = await Promise.all([
        buildIco([16, 32, 48]),
        canvasPng(renderIcon(16)),
        canvasPng(renderIcon(32)),
        canvasPng(renderIcon(180, { apple: true })),
        canvasPng(renderIcon(192)),
        canvasPng(renderIcon(512)),
    ]);
    const text = (s) => new TextEncoder().encode(s);
    const zip = zipSync({
        'favicon.ico': ico,
        'favicon-16x16.png': p16,
        'favicon-32x32.png': p32,
        'apple-touch-icon.png': apple,
        'android-chrome-192x192.png': p192,
        'android-chrome-512x512.png': p512,
        'site.webmanifest': text(`${manifest()}\n`),
        'favicon-html.txt': text(`Paste inside <head>:\n\n${snippet()}\n`),
    }, { level: 6 });
    save(zip, 'favicon.zip', 'application/zip');
    els.zip.disabled = false;
});

els.ico.addEventListener('click', async () => {
    save(await buildIco([16, 32, 48]), 'favicon.ico', 'image/x-icon');
});

els.copySnippet.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(snippet());
        els.copySnippet.textContent = 'Copied';
    } catch {
        els.copySnippet.textContent = 'Select and copy it instead';
    }
    setTimeout(() => { els.copySnippet.textContent = 'Copy'; }, 2000);
});

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function setMode(next) {
    mode = next;
    for (const t of els.modeTabs) t.setAttribute('aria-selected', String(t.dataset.mode === mode));
    for (const f of els.forms) f.hidden = f.dataset.form !== mode;
    // Pixel art usually wants a see-through, unpadded square.
    if (mode === 'pixel' && !pixels.some(Boolean)) {
        els.transparent.checked = true;
        els.padding.value = '0';
        els.shape.value = '0';
    }
    render();
}

for (const t of els.modeTabs) t.addEventListener('click', () => setMode(t.dataset.mode));

els.imageFile.addEventListener('change', async () => {
    const img = await loadImage(els.imageFile.files[0]);
    if (img) {
        image = img;
        render();
    }
});

els.traceFile.addEventListener('change', async () => {
    await trace(els.traceFile.files[0]);
    els.traceFile.value = '';
});

document.querySelector('.tool-layout').addEventListener('input', (e) => {
    if (e.target.type !== 'file') render();
});
document.querySelector('.tool-layout').addEventListener('change', (e) => {
    if (e.target.type !== 'file' && e.target !== els.gridSize) render();
});

setPen(els.penColor.value);
// Fonts may arrive a moment after the page, so draw again once they are ready.
document.fonts?.ready.then(render);
render();
