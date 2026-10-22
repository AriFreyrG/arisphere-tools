// Arisphere PDF Editor. Everything happens in this tab: pdf.js draws the pages,
// pdf-lib writes the edited file, and no bytes are ever sent anywhere.
import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

const { PDFDocument, StandardFonts, rgb, degrees, BlendMode } = window.PDFLib;

const vendorUrl = (path) => new URL(`../vendor/pdfjs/${path}`, import.meta.url).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = vendorUrl('pdf.worker.min.mjs');

const PX_PER_PT = 96 / 72;
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const THUMB_WIDTH = 132;
const HIGHLIGHT_COLOR = '#fde047';

// Where the first baseline sits below the top of a text box with line-height 1.2,
// as a fraction of the font size. Matches the browser's metrics for these fonts.
const FONTS = {
    Helvetica: { css: "Helvetica, Arial, 'Liberation Sans', sans-serif", pdf: StandardFonts.Helvetica, baseline: 0.947 },
    TimesRoman: { css: "'Times New Roman', Times, 'Liberation Serif', serif", pdf: StandardFonts.TimesRoman, baseline: 0.938 },
    Courier: { css: "'Courier New', Courier, 'Liberation Mono', monospace", pdf: StandardFonts.Courier, baseline: 0.866 },
};

const $ = (id) => document.getElementById(id);
const els = {
    openInput: $('file-open'),
    addInput: $('file-add'),
    imageInput: $('image-input'),
    toolButtons: [...document.querySelectorAll('.tool-btn')],
    color: $('opt-color'),
    size: $('opt-size'),
    font: $('opt-font'),
    undo: $('undo'),
    redo: $('redo'),
    rotateLeft: $('rotate-left'),
    rotateRight: $('rotate-right'),
    deletePage: $('delete-page'),
    zoomIn: $('zoom-in'),
    zoomOut: $('zoom-out'),
    zoomLabel: $('zoom-label'),
    download: $('download'),
    thumbs: $('thumbs'),
    viewer: $('viewer'),
    dropzone: $('dropzone'),
    pageWrap: $('page-wrap'),
    canvas: $('page-canvas'),
    overlay: $('overlay'),
    status: $('status'),
};

// ---------------------------------------------------------------------------
// State
//
// Annotation coordinates are in PDF points, in the page's own orientation
// (before any rotation the user adds here), with the origin at the top left.
// The overlay is rotated with CSS so annotations turn along with the page.
// ---------------------------------------------------------------------------

const sources = new Map(); // id -> { name, pdfjs, pdfLib }
const images = new Map(); // id -> { bytes, type, url }
let pages = []; // { id, srcId, index, rotation, annots: [] }
let current = -1;
let zoom = 1;
let tool = 'select';
let selectedId = null;
let editingId = null;
let editDraft = null; // { id, text, isNew } for the text box being typed in
let dirty = false;
let nextId = 1;
const undoStack = [];
const redoStack = [];

const uid = () => `a${nextId++}`;

// Text and images remember the page rotation they were placed at (a.rot) so
// they stay upright as the user saw them. In the annotation frame they are
// turned by -rot; this applies that turn to a vector.
function turn(rot, x, y) {
    const rad = (-rot * Math.PI) / 180;
    const cos = Math.round(Math.cos(rad));
    const sin = Math.round(Math.sin(rad));
    return [x * cos - y * sin, x * sin + y * cos];
}
const currentPage = () => pages[current];
const findAnnot = (id) => currentPage()?.annots.find((a) => a.id === id);

// ---------------------------------------------------------------------------
// Status messages
// ---------------------------------------------------------------------------

let statusTimer;
function showStatus(message, { error = false, ms = 3500 } = {}) {
    els.status.textContent = message;
    els.status.classList.toggle('is-error', error);
    els.status.classList.add('is-visible');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => els.status.classList.remove('is-visible'), ms);
}

// ---------------------------------------------------------------------------
// Undo / redo: snapshots of the page list, which is small plain data.
// ---------------------------------------------------------------------------

function snapshot() {
    return { pages: structuredClone(pages), current };
}

function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    dirty = true;
    updateButtons();
}

function restore(state) {
    const previous = { current, pageId: currentPage()?.id };
    const rotations = new Map(pages.map((p) => [p.id, p.rotation]));
    pages = state.pages;
    current = Math.min(state.current, pages.length - 1);
    selectedId = null;
    editingId = null;
    const thumbsChanged = pages.length !== els.thumbs.children.length
        || pages.some((p, i) => els.thumbs.children[i]?.dataset.id !== p.id || rotations.get(p.id) !== p.rotation);
    if (thumbsChanged) renderThumbs();
    const pageChanged = state.current !== previous.current || pages[current]?.id !== previous.pageId
        || rotations.get(pages[current]?.id) !== pages[current]?.rotation;
    if (pageChanged) {
        renderPage();
    } else {
        updateButtons();
        renderOverlay();
    }
}

function undo() {
    if (!undoStack.length) return;
    commitEditing();
    redoStack.push(snapshot());
    restore(undoStack.pop());
}

function redo() {
    if (!redoStack.length) return;
    commitEditing();
    undoStack.push(snapshot());
    restore(redoStack.pop());
}

// ---------------------------------------------------------------------------
// Loading files
// ---------------------------------------------------------------------------

async function loadPdf(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let pdfjs;
    try {
        pdfjs = await pdfjsLib.getDocument({
            data: bytes.slice(),
            cMapUrl: vendorUrl('cmaps/'),
            cMapPacked: true,
            standardFontDataUrl: vendorUrl('standard_fonts/'),
            isEvalSupported: false,
        }).promise;
    } catch (err) {
        if (err?.name === 'PasswordException') throw new Error(`"${file.name}" is password-protected. Remove the password first, then open it again.`);
        throw new Error(`"${file.name}" could not be opened as a PDF.`);
    }

    let pdfLib;
    try {
        pdfLib = await PDFDocument.load(bytes, { updateMetadata: false });
    } catch (err) {
        pdfjs.destroy();
        if (err?.name === 'EncryptedPDFError' || /encrypt/i.test(err?.message)) {
            throw new Error(`"${file.name}" is encrypted, so it can be viewed but not saved here.`);
        }
        throw new Error(`"${file.name}" could not be read for editing.`);
    }

    const srcId = uid();
    sources.set(srcId, { name: file.name, pdfjs, pdfLib });
    const added = [];
    for (let i = 0; i < pdfjs.numPages; i++) {
        added.push({ id: uid(), srcId, index: i, rotation: 0, annots: [] });
    }
    return added;
}

async function openFiles(files, { replace }) {
    const pdfs = [...files].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (!pdfs.length) {
        showStatus('Please choose a PDF file.', { error: true });
        return;
    }
    if (replace && dirty && !confirm('Open a new PDF? Your current changes will be lost.')) return;

    showStatus(pdfs.length > 1 ? `Opening ${pdfs.length} files...` : `Opening ${pdfs[0].name}...`, { ms: 60000 });
    const added = [];
    const errors = [];
    for (const file of pdfs) {
        try {
            added.push(...await loadPdf(file));
        } catch (err) {
            errors.push(err.message);
        }
    }

    if (added.length) {
        commitEditing();
        if (replace) {
            for (const [id, src] of sources) {
                if (!added.some((p) => p.srcId === id)) {
                    src.pdfjs.destroy();
                    sources.delete(id);
                }
            }
            pages = [];
            undoStack.length = 0;
            redoStack.length = 0;
            dirty = false;
        } else {
            pushHistory();
        }
        const firstNew = pages.length;
        pages.push(...added);
        current = replace ? 0 : firstNew;
        selectedId = null;
        if (replace) zoom = await fitZoom(pages[0]);
        renderThumbs();
        await renderPage();
    }

    if (errors.length) showStatus(errors.join(' '), { error: true, ms: 7000 });
    else showStatus(added.length === 1 ? 'Opened 1 page.' : `Opened ${added.length} pages.`);
}

async function fitZoom(page) {
    const pdfPage = await sources.get(page.srcId).pdfjs.getPage(page.index + 1);
    const vp = pdfPage.getViewport({ scale: PX_PER_PT, rotation: pdfPage.rotate + page.rotation });
    const available = els.viewer.clientWidth - 48;
    return Math.max(0.25, Math.min(1.25, available / vp.width));
}

async function addImage(file) {
    const page = currentPage();
    if (!page) {
        showStatus('Open a PDF first.', { error: true });
        return;
    }
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
        showStatus('Images must be PNG or JPG.', { error: true });
        return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = URL.createObjectURL(new Blob([bytes], { type: file.type }));
    const img = new Image();
    img.src = url;
    try {
        await img.decode();
    } catch {
        URL.revokeObjectURL(url);
        showStatus('That image could not be read.', { error: true });
        return;
    }
    const imgId = uid();
    images.set(imgId, { bytes, type: file.type, url });

    const { width, height } = await baseSize(page);
    const rot = page.rotation;
    const shownWidth = rot % 180 ? height : width;
    const w = Math.min(img.naturalWidth * 0.75, shownWidth * 0.4);
    const h = w * (img.naturalHeight / img.naturalWidth);
    const [hx, hy] = turn(rot, w / 2, h / 2);
    pushHistory();
    const annot = { id: uid(), type: 'image', imgId, x: width / 2 - hx, y: height / 2 - hy, w, h, rot };
    page.annots.push(annot);
    setTool('select');
    selectedId = annot.id;
    renderOverlay();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const pdfPageCache = new Map();
function getPdfPage(page) {
    const key = `${page.srcId}:${page.index}`;
    if (!pdfPageCache.has(key)) pdfPageCache.set(key, sources.get(page.srcId).pdfjs.getPage(page.index + 1));
    return pdfPageCache.get(key);
}

// Size of the page in points, in its own orientation (the frame annotations use).
async function baseSize(page) {
    const pdfPage = await getPdfPage(page);
    const vp = pdfPage.getViewport({ scale: 1, rotation: pdfPage.rotate });
    return { width: vp.width, height: vp.height };
}

let renderTask = null;
let renderSeq = 0;
async function renderPage() {
    updateButtons();
    highlightThumb();
    const page = currentPage();
    els.dropzone.hidden = !!page;
    els.pageWrap.hidden = !page;
    if (!page) return;

    const seq = ++renderSeq;
    const pdfPage = await getPdfPage(page);
    if (seq !== renderSeq) return;

    const scale = zoom * PX_PER_PT;
    const dpr = window.devicePixelRatio || 1;
    const viewport = pdfPage.getViewport({ scale, rotation: pdfPage.rotate + page.rotation });

    // Draw into an offscreen canvas, then swap, so the page never flashes blank.
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    renderTask?.cancel();
    renderTask = pdfPage.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    });
    try {
        await renderTask.promise;
    } catch (err) {
        if (err?.name === 'RenderingCancelledException') return;
        throw err;
    }
    if (seq !== renderSeq) return;

    const target = els.canvas;
    target.width = canvas.width;
    target.height = canvas.height;
    target.style.width = `${viewport.width}px`;
    target.style.height = `${viewport.height}px`;
    target.getContext('2d').drawImage(canvas, 0, 0);
    els.pageWrap.style.width = `${viewport.width}px`;
    els.pageWrap.style.height = `${viewport.height}px`;

    renderOverlay();
}

// Placing the overlay: it is laid out in the page's own orientation and turned
// with CSS to match the rotation the user added.
let overlayFrame = { width: 0, height: 0, rotation: 0, scale: 1 };
function layoutOverlay(page, { width, height }) {
    const scale = zoom * PX_PER_PT;
    const rotation = ((page.rotation % 360) + 360) % 360;
    const W = width * scale;
    const H = height * scale;
    const transforms = {
        0: '',
        90: `translate(${H}px, 0) rotate(90deg)`,
        180: `translate(${W}px, ${H}px) rotate(180deg)`,
        270: `translate(0, ${W}px) rotate(270deg)`,
    };
    els.overlay.style.width = `${W}px`;
    els.overlay.style.height = `${H}px`;
    els.overlay.style.transform = transforms[rotation];
    overlayFrame = { width, height, rotation, scale };
}

// Converts a pointer position to page points in the overlay's frame.
function toPagePoint(event) {
    const rect = els.overlay.getBoundingClientRect();
    const { width, height, rotation, scale } = overlayFrame;
    const u = (event.clientX - rect.left) / scale;
    const v = (event.clientY - rect.top) / scale;
    switch (rotation) {
        case 90: return { x: v, y: height - u };
        case 180: return { x: width - u, y: height - v };
        case 270: return { x: width - v, y: u };
        default: return { x: u, y: v };
    }
}

let overlaySeq = 0;
async function renderOverlay() {
    const seq = ++overlaySeq;
    if (!currentPage()) return;
    const size = await baseSize(currentPage());
    // A newer call may have started while waiting; only the latest one draws.
    const page = currentPage();
    if (seq !== overlaySeq || !page) return;
    layoutOverlay(page, size);
    const s = overlayFrame.scale;
    els.overlay.dataset.tool = tool;
    els.overlay.replaceChildren();

    for (const a of page.annots) {
        const el = document.createElement('div');
        el.className = 'annot';
        el.dataset.id = a.id;

        if (a.type === 'text') {
            el.classList.add('annot-text');
            el.textContent = a.id === editDraft?.id ? editDraft.text : a.text;
            el.style.left = `${a.x * s}px`;
            el.style.top = `${a.y * s}px`;
            el.style.fontSize = `${a.size * s}px`;
            el.style.fontFamily = FONTS[a.font].css;
            el.style.color = a.color;
            if (a.rot) el.style.transform = `rotate(${-a.rot}deg)`;
            if (a.id === editingId) startEditing(el);
        } else if (a.type === 'draw') {
            const box = drawBounds(a);
            el.classList.add('annot-draw');
            placeBox(el, box, s);
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            line.setAttribute('points', a.points.map((p) => p.join(',')).join(' '));
            line.setAttribute('fill', 'none');
            line.setAttribute('stroke', a.color);
            line.setAttribute('stroke-width', a.width);
            line.setAttribute('stroke-linecap', 'round');
            line.setAttribute('stroke-linejoin', 'round');
            svg.append(line);
            el.append(svg);
        } else {
            placeBox(el, a, s);
            if (a.type === 'image') {
                el.classList.add('annot-img');
                if (a.rot) el.style.transform = `rotate(${-a.rot}deg)`;
                const img = document.createElement('img');
                img.src = images.get(a.imgId).url;
                img.alt = '';
                el.append(img);
            } else {
                el.classList.add(`annot-rect-${a.type}`);
            }
            if (a.id === selectedId) {
                const handle = document.createElement('div');
                handle.className = 'resize-handle';
                el.append(handle);
            }
        }

        el.classList.toggle('is-selected', a.id === selectedId);
        els.overlay.append(el);
        if (a.id === editingId) focusEnd(el);
    }
}

function placeBox(el, box, s) {
    el.style.left = `${box.x * s}px`;
    el.style.top = `${box.y * s}px`;
    el.style.width = `${box.w * s}px`;
    el.style.height = `${box.h * s}px`;
}

function drawBounds(a) {
    const xs = a.points.map((p) => p[0]);
    const ys = a.points.map((p) => p[1]);
    const pad = a.width / 2 + 1;
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

// ---------------------------------------------------------------------------
// Thumbnails and page order
// ---------------------------------------------------------------------------

let thumbSeq = 0;
async function renderThumbs() {
    const seq = ++thumbSeq;
    els.thumbs.replaceChildren(...pages.map((page, i) => {
        const li = document.createElement('li');
        li.className = 'thumb';
        li.dataset.id = page.id;
        li.draggable = true;
        li.tabIndex = 0;
        li.setAttribute('aria-label', `Page ${i + 1}`);
        const canvas = document.createElement('canvas');
        const label = document.createElement('span');
        label.textContent = i + 1;
        li.append(canvas, label);
        return li;
    }));
    highlightThumb();

    for (const li of [...els.thumbs.children]) {
        if (seq !== thumbSeq) return;
        const page = pages.find((p) => p.id === li.dataset.id);
        const pdfPage = await getPdfPage(page);
        const base = pdfPage.getViewport({ scale: 1, rotation: pdfPage.rotate + page.rotation });
        const viewport = pdfPage.getViewport({ scale: THUMB_WIDTH / base.width, rotation: pdfPage.rotate + page.rotation });
        const canvas = li.querySelector('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise.catch(() => {});
    }
}

function highlightThumb() {
    [...els.thumbs.children].forEach((li, i) => {
        li.classList.toggle('is-current', i === current);
        li.querySelector('span').textContent = i + 1;
        li.setAttribute('aria-label', `Page ${i + 1}`);
    });
    els.thumbs.children[current]?.scrollIntoView({ block: 'nearest' });
}

function goToPage(i) {
    if (i < 0 || i >= pages.length || i === current) return;
    commitEditing();
    current = i;
    selectedId = null;
    renderPage();
}

els.thumbs.addEventListener('click', (e) => {
    const li = e.target.closest('.thumb');
    if (li) goToPage([...els.thumbs.children].indexOf(li));
});

els.thumbs.addEventListener('keydown', (e) => {
    const li = e.target.closest('.thumb');
    if (!li) return;
    const i = [...els.thumbs.children].indexOf(li);
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToPage(i);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
        e.preventDefault();
        movePage(i, e.key === 'ArrowUp' ? i - 1 : i + 1);
        li.focus();
    }
});

function movePage(from, to) {
    if (to < 0 || to >= pages.length || from === to) return;
    pushHistory();
    const currentId = currentPage()?.id;
    const [moved] = pages.splice(from, 1);
    pages.splice(to, 0, moved);
    current = pages.findIndex((p) => p.id === currentId);
    const li = els.thumbs.children[from];
    els.thumbs.insertBefore(li, els.thumbs.children[to > from ? to + 1 : to] ?? null);
    highlightThumb();
    updateButtons();
}

let dragFrom = -1;
els.thumbs.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.thumb');
    dragFrom = [...els.thumbs.children].indexOf(li);
    li.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragFrom));
});

function clearDropMarks() {
    for (const li of els.thumbs.children) li.classList.remove('drop-before', 'drop-after', 'is-dragging');
}

function dropTarget(e) {
    const li = e.target.closest('.thumb');
    if (!li) return null;
    const rect = li.getBoundingClientRect();
    const vertical = getComputedStyle(els.thumbs).flexDirection === 'column';
    const after = vertical ? e.clientY > rect.top + rect.height / 2 : e.clientX > rect.left + rect.width / 2;
    return { li, after };
}

els.thumbs.addEventListener('dragover', (e) => {
    if (dragFrom < 0) return;
    e.preventDefault();
    const target = dropTarget(e);
    for (const li of els.thumbs.children) li.classList.remove('drop-before', 'drop-after');
    if (target) target.li.classList.add(target.after ? 'drop-after' : 'drop-before');
});

els.thumbs.addEventListener('drop', (e) => {
    if (dragFrom < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const target = dropTarget(e);
    if (target) {
        let to = [...els.thumbs.children].indexOf(target.li) + (target.after ? 1 : 0);
        if (to > dragFrom) to -= 1;
        movePage(dragFrom, to);
    }
    clearDropMarks();
    dragFrom = -1;
});

els.thumbs.addEventListener('dragend', () => {
    clearDropMarks();
    dragFrom = -1;
});

function rotateCurrent(delta) {
    const page = currentPage();
    if (!page) return;
    commitEditing();
    pushHistory();
    page.rotation = (((page.rotation + delta) % 360) + 360) % 360;
    renderThumbs();
    renderPage();
}

function deleteCurrent() {
    if (!currentPage()) return;
    commitEditing();
    pushHistory();
    pages.splice(current, 1);
    current = Math.min(current, pages.length - 1);
    selectedId = null;
    renderThumbs();
    renderPage();
    showStatus(pages.length ? 'Page deleted. Use Undo to bring it back.' : 'All pages deleted. Use Undo to bring them back.');
}

// ---------------------------------------------------------------------------
// Tools and pointer handling on the page
// ---------------------------------------------------------------------------

function setTool(name) {
    commitEditing();
    tool = name;
    for (const b of els.toolButtons) b.classList.toggle('is-active', b.dataset.tool === name);
    if (name !== 'select') selectedId = null;
    els.overlay.dataset.tool = name;
    renderOverlay();
    if (name === 'whiteout') showStatus('White-out hides what is underneath but does not delete it. Do not use it to redact private information.', { ms: 6000 });
}

function penWidth() {
    return Math.max(1, Number(els.size.value) / 6);
}

let gesture = null;
let lastClick = { id: null, time: 0 };

els.overlay.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !currentPage()) return;
    const annotEl = e.target.closest('.annot');
    if (annotEl && annotEl.dataset.id === editingId) return; // clicks inside the text being edited
    commitEditing();
    const p = toPagePoint(e);
    const page = currentPage();

    if (tool === 'select') {
        if (!annotEl) {
            if (selectedId) {
                selectedId = null;
                renderOverlay();
            }
            return;
        }
        const annot = findAnnot(annotEl.dataset.id);
        const now = performance.now();
        if (annot.type === 'text' && lastClick.id === annot.id && now - lastClick.time < 400) {
            lastClick = { id: null, time: 0 };
            beginEditing(annot);
            e.preventDefault();
            return;
        }
        lastClick = { id: annot.id, time: now };
        selectedId = annot.id;
        syncOptionsFrom(annot);
        gesture = {
            kind: e.target.classList.contains('resize-handle') ? 'resize' : 'move',
            annot,
            start: p,
            original: structuredClone(annot),
            before: snapshot(),
            changed: false,
        };
        renderOverlay();
    } else if (tool === 'text') {
        if (annotEl) {
            beginEditing(findAnnot(annotEl.dataset.id));
            e.preventDefault();
            return;
        }
        pushHistory();
        const size = Number(els.size.value);
        const font = els.font.value;
        const rot = page.rotation;
        const [ox, oy] = turn(rot, 0, size * FONTS[font].baseline);
        const annot = {
            id: uid(), type: 'text', text: '',
            x: p.x - ox, y: p.y - oy,
            size, font, color: els.color.value, rot,
        };
        page.annots.push(annot);
        beginEditing(annot, true);
        e.preventDefault();
        return;
    } else if (tool === 'highlight' || tool === 'whiteout') {
        const annot = { id: uid(), type: tool, x: p.x, y: p.y, w: 0, h: 0 };
        gesture = { kind: 'rect', annot, start: p, before: snapshot() };
        page.annots.push(annot);
        renderOverlay();
    } else if (tool === 'draw') {
        const annot = { id: uid(), type: 'draw', points: [[p.x, p.y]], color: els.color.value, width: penWidth() };
        gesture = { kind: 'draw', annot, before: snapshot() };
        page.annots.push(annot);
        renderOverlay();
    }
    if (gesture) els.overlay.setPointerCapture(e.pointerId);
});

els.overlay.addEventListener('pointermove', (e) => {
    if (!gesture) return;
    const p = toPagePoint(e);
    const { annot } = gesture;

    if (gesture.kind === 'move') {
        const dx = p.x - gesture.start.x;
        const dy = p.y - gesture.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.5) gesture.changed = true;
        if (annot.type === 'draw') {
            annot.points = gesture.original.points.map(([x, y]) => [x + dx, y + dy]);
        } else {
            annot.x = gesture.original.x + dx;
            annot.y = gesture.original.y + dy;
        }
    } else if (gesture.kind === 'resize') {
        gesture.changed = true;
        // An image may be turned, so measure the drag along its own sides.
        const [dx, dy] = turn(-(annot.rot || 0), p.x - gesture.start.x, p.y - gesture.start.y);
        const w = Math.max(4, gesture.original.w + dx);
        if (annot.type === 'image') {
            annot.w = w;
            annot.h = w * (gesture.original.h / gesture.original.w);
        } else {
            annot.w = w;
            annot.h = Math.max(4, gesture.original.h + dy);
        }
    } else if (gesture.kind === 'rect') {
        annot.x = Math.min(p.x, gesture.start.x);
        annot.y = Math.min(p.y, gesture.start.y);
        annot.w = Math.abs(p.x - gesture.start.x);
        annot.h = Math.abs(p.y - gesture.start.y);
    } else if (gesture.kind === 'draw') {
        const last = annot.points[annot.points.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) >= 1) annot.points.push([p.x, p.y]);
    }
    renderOverlay();
});

function endGesture() {
    if (!gesture) return;
    const { annot, kind, before } = gesture;
    const page = currentPage();
    let keep = true;
    if (kind === 'rect') keep = annot.w >= 3 && annot.h >= 3;
    if (kind === 'draw' && annot.points.length === 1) annot.points.push([annot.points[0][0] + 0.1, annot.points[0][1]]);
    if (!keep) page.annots = page.annots.filter((a) => a !== annot);
    if (keep && (kind === 'rect' || kind === 'draw' || gesture.changed)) {
        undoStack.push(before);
        redoStack.length = 0;
        dirty = true;
        updateButtons();
    }
    gesture = null;
    renderOverlay();
}

els.overlay.addEventListener('pointerup', endGesture);
els.overlay.addEventListener('pointercancel', endGesture);

// Text editing happens directly in the overlay element. The typed text lives in
// editDraft until it is committed, so redrawing the overlay never loses it.
function beginEditing(annot, isNew = false) {
    selectedId = annot.id;
    editingId = annot.id;
    editDraft = { id: annot.id, text: annot.text, isNew };
    renderOverlay();
}

function focusEnd(el) {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function startEditing(el) {
    el.contentEditable = 'plaintext-only';
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.spellcheck = false;
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            commitEditing();
        }
        e.stopPropagation();
    });
    el.addEventListener('input', () => {
        if (editDraft?.id === el.dataset.id) editDraft.text = el.innerText;
    });
    el.addEventListener('blur', () => {
        if (el.isConnected) commitEditing();
    });
}

function commitEditing() {
    if (!editingId) return;
    const draft = editDraft;
    editingId = null;
    editDraft = null;
    const page = currentPage();
    const annot = page?.annots.find((a) => a.id === draft.id);
    if (annot) {
        const text = draft.text.replace(/\u00a0/g, ' ').replace(/\n$/, '');
        if (!text.trim()) {
            // An empty new box was never really added, so drop its undo step too.
            if (draft.isNew) undoStack.pop();
            else pushHistory();
            page.annots = page.annots.filter((a) => a !== annot);
            if (selectedId === annot.id) selectedId = null;
            updateButtons();
        } else if (text !== annot.text) {
            if (!draft.isNew) pushHistory();
            annot.text = text;
            dirty = true;
        }
    }
    renderOverlay();
}

function deleteSelected() {
    const page = currentPage();
    if (!page || !selectedId) return;
    pushHistory();
    page.annots = page.annots.filter((a) => a.id !== selectedId);
    selectedId = null;
    renderOverlay();
}

function syncOptionsFrom(annot) {
    if (annot.color) els.color.value = annot.color;
    if (annot.type === 'text') {
        els.size.value = String(annot.size);
        if (![...els.size.options].some((o) => o.value === String(annot.size))) els.size.value = '12';
        els.font.value = annot.font;
    }
}

// Changing a style option restyles the selected annotation, if it has that style.
function applyOption(apply) {
    const annot = findAnnot(selectedId);
    if (!annot || !apply(annot, true)) return;
    pushHistory();
    apply(annot, false);
    renderOverlay();
}

els.color.addEventListener('change', () => applyOption((a, test) => {
    if (!('color' in a)) return false;
    if (!test) a.color = els.color.value;
    return true;
}));

els.size.addEventListener('change', () => applyOption((a, test) => {
    if (a.type !== 'text' && a.type !== 'draw') return false;
    if (!test) {
        if (a.type === 'text') a.size = Number(els.size.value);
        else a.width = penWidth();
    }
    return true;
}));

els.font.addEventListener('change', () => applyOption((a, test) => {
    if (a.type !== 'text') return false;
    if (!test) a.font = els.font.value;
    return true;
}));

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Standard PDF fonts only cover Western European characters.
function encodable(font, text, replaced) {
    let out = '';
    for (const ch of text) {
        try {
            font.encodeText(ch);
            out += ch;
        } catch {
            out += '?';
            replaced.count += 1;
        }
    }
    return out;
}

async function buildPdf() {
    const out = await PDFDocument.create();
    const fonts = {};
    const embeddedImages = new Map();
    const replaced = { count: 0 };

    // Copy each source's pages in one go so shared fonts and images are copied once.
    const copies = new Map();
    for (const srcId of new Set(pages.map((p) => p.srcId))) {
        const wanted = pages.filter((p) => p.srcId === srcId);
        const copied = await out.copyPages(sources.get(srcId).pdfLib, wanted.map((p) => p.index));
        wanted.forEach((p, i) => copies.set(p, copied[i]));
    }

    for (const page of pages) {
        const pdfPage = await getPdfPage(page);
        const copied = copies.get(page);
        out.addPage(copied);
        copied.setRotation(degrees((pdfPage.rotate + page.rotation) % 360));
        if (!page.annots.length) continue;

        // Maps points in the annotation frame to PDF user space.
        const vp = pdfPage.getViewport({ scale: 1, rotation: pdfPage.rotate });
        const toPdf = (x, y) => {
            const [px, py] = vp.convertToPdfPoint(x, y);
            return { x: px, y: py };
        };
        // The PDF angle of the direction text or an image placed at `rot` reads along.
        const o = toPdf(0, 0);
        const angleFor = (rot) => {
            const r = toPdf(...turn(rot || 0, 1, 0));
            return Math.round(Math.atan2(r.y - o.y, r.x - o.x) * 180 / Math.PI);
        };
        // A point offset from an annotation's anchor along its own sides.
        const along = (a, dx, dy) => {
            const [tx, ty] = turn(a.rot || 0, dx, dy);
            return toPdf(a.x + tx, a.y + ty);
        };
        const rectToPdf = (a) => {
            const p1 = toPdf(a.x, a.y);
            const p2 = toPdf(a.x + a.w, a.y + a.h);
            return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), width: Math.abs(p2.x - p1.x), height: Math.abs(p2.y - p1.y) };
        };

        for (const a of page.annots) {
            if (a.type === 'whiteout') {
                copied.drawRectangle({ ...rectToPdf(a), color: rgb(1, 1, 1) });
            } else if (a.type === 'highlight') {
                copied.drawRectangle({ ...rectToPdf(a), color: hexToRgb(HIGHLIGHT_COLOR), opacity: 0.45, blendMode: BlendMode.Multiply });
            } else if (a.type === 'draw') {
                const color = hexToRgb(a.color);
                for (let i = 1; i < a.points.length; i++) {
                    copied.drawLine({
                        start: toPdf(...a.points[i - 1]),
                        end: toPdf(...a.points[i]),
                        thickness: a.width,
                        color,
                        lineCap: 1,
                    });
                }
            } else if (a.type === 'image') {
                if (!embeddedImages.has(a.imgId)) {
                    const img = images.get(a.imgId);
                    embeddedImages.set(a.imgId, img.type === 'image/png' ? await out.embedPng(img.bytes) : await out.embedJpg(img.bytes));
                }
                copied.drawImage(embeddedImages.get(a.imgId), {
                    ...along(a, 0, a.h),
                    width: a.w,
                    height: a.h,
                    rotate: degrees(angleFor(a.rot)),
                });
            } else if (a.type === 'text') {
                fonts[a.font] ??= await out.embedFont(FONTS[a.font].pdf);
                const font = fonts[a.font];
                const color = hexToRgb(a.color);
                a.text.split('\n').forEach((line, i) => {
                    if (!line) return;
                    copied.drawText(encodable(font, line, replaced), {
                        ...along(a, 0, i * a.size * 1.2 + a.size * FONTS[a.font].baseline),
                        size: a.size,
                        font,
                        color,
                        rotate: degrees(angleFor(a.rot)),
                    });
                });
            }
        }
    }

    return { bytes: await out.save(), replaced: replaced.count };
}

async function download() {
    if (!pages.length) return;
    commitEditing();
    els.download.disabled = true;
    showStatus('Building your PDF...', { ms: 60000 });
    try {
        const { bytes, replaced } = await buildPdf();
        const first = sources.get(pages[0].srcId).name.replace(/\.pdf$/i, '');
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${first}-edited.pdf`;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        dirty = false;
        showStatus(replaced
            ? `Saved. ${replaced} character${replaced === 1 ? ' was' : 's were'} not supported by the PDF fonts and became "?".`
            : 'Saved. Check your downloads.', { ms: replaced ? 7000 : 3500 });
    } catch (err) {
        console.error(err);
        showStatus('Sorry, this PDF could not be saved.', { error: true, ms: 6000 });
    } finally {
        updateButtons();
    }
}

// ---------------------------------------------------------------------------
// Zoom, buttons and global events
// ---------------------------------------------------------------------------

function setZoom(z) {
    zoom = Math.max(ZOOM_STEPS[0], Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], z));
    renderPage();
}

function stepZoom(dir) {
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > zoom + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.001);
    if (next) setZoom(next);
}

function updateButtons() {
    const has = pages.length > 0;
    for (const b of [els.rotateLeft, els.rotateRight, els.deletePage, els.zoomIn, els.zoomOut, els.download]) b.disabled = !has;
    els.undo.disabled = !undoStack.length;
    els.redo.disabled = !redoStack.length;
    els.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

els.openInput.addEventListener('change', () => {
    openFiles(els.openInput.files, { replace: true });
    els.openInput.value = '';
});

els.addInput.addEventListener('change', () => {
    openFiles(els.addInput.files, { replace: pages.length === 0 });
    els.addInput.value = '';
});

els.imageInput.addEventListener('change', () => {
    if (els.imageInput.files[0]) addImage(els.imageInput.files[0]);
    els.imageInput.value = '';
});

for (const b of els.toolButtons) b.addEventListener('click', () => setTool(b.dataset.tool));
els.undo.addEventListener('click', undo);
els.redo.addEventListener('click', redo);
els.rotateLeft.addEventListener('click', () => rotateCurrent(-90));
els.rotateRight.addEventListener('click', () => rotateCurrent(90));
els.deletePage.addEventListener('click', deleteCurrent);
els.zoomIn.addEventListener('click', () => stepZoom(1));
els.zoomOut.addEventListener('click', () => stepZoom(-1));
els.download.addEventListener('click', download);

// Drag and drop files anywhere on the page area.
els.viewer.addEventListener('dragover', (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    els.viewer.classList.add('is-dragover');
});
els.viewer.addEventListener('dragleave', () => els.viewer.classList.remove('is-dragover'));
els.viewer.addEventListener('drop', (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    els.viewer.classList.remove('is-dragover');
    const files = [...e.dataTransfer.files];
    const image = files.find((f) => f.type === 'image/png' || f.type === 'image/jpeg');
    if (image && pages.length) addImage(image);
    else openFiles(files, { replace: pages.length === 0 });
});

const TOOL_KEYS = { v: 'select', t: 'text', h: 'highlight', w: 'whiteout', d: 'draw' };
document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteSelected();
    } else if (e.key === 'Escape' && selectedId) {
        selectedId = null;
        renderOverlay();
    } else if (!mod && !e.altKey && TOOL_KEYS[e.key.toLowerCase()] && pages.length) {
        setTool(TOOL_KEYS[e.key.toLowerCase()]);
    } else if (!mod && (e.key === 'PageDown' || e.key === 'PageUp')) {
        e.preventDefault();
        goToPage(current + (e.key === 'PageDown' ? 1 : -1));
    }
});

window.addEventListener('beforeunload', (e) => {
    if (dirty && pages.length) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// A file dropped outside the page area would make the browser leave this page.
document.addEventListener('dragover', (e) => {
    if ([...e.dataTransfer.types].includes('Files')) e.preventDefault();
});
document.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) e.preventDefault();
});

updateButtons();
