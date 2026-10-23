// Arisphere QR Code Generator. Codes are built in the page with qrcode-generator;
// nothing typed here leaves the browser.
const qrcode = window.qrcode;
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

const $ = (id) => document.getElementById(id);
const els = {
    tabs: [...document.querySelectorAll('[role="tab"]')],
    forms: [...document.querySelectorAll('[data-form]')],
    text: $('text'),
    wifiSsid: $('wifi-ssid'),
    wifiPass: $('wifi-pass'),
    wifiType: $('wifi-type'),
    wifiHidden: $('wifi-hidden'),
    emailTo: $('email-to'),
    emailSubject: $('email-subject'),
    emailBody: $('email-body'),
    phone: $('phone'),
    fg: $('fg'),
    bg: $('bg'),
    transparent: $('transparent'),
    ecc: $('ecc'),
    margin: $('margin'),
    size: $('size'),
    sizeLabel: $('size-label'),
    preview: $('preview'),
    message: $('message'),
    png: $('download-png'),
    svg: $('download-svg'),
    copy: $('copy'),
};

let kind = 'text';
let code = null; // { count, isDark(r, c) } for the current content, or null

// ---------------------------------------------------------------------------
// What goes in the code
// ---------------------------------------------------------------------------

// Wi-Fi strings escape these characters with a backslash.
const wifiEscape = (s) => s.replace(/([\\;,:"])/g, '\\$1');

function payload() {
    switch (kind) {
        case 'wifi': {
            const ssid = els.wifiSsid.value;
            if (!ssid) return '';
            const type = els.wifiType.value;
            let s = `WIFI:T:${type};S:${wifiEscape(ssid)};`;
            if (type !== 'nopass') s += `P:${wifiEscape(els.wifiPass.value)};`;
            if (els.wifiHidden.checked) s += 'H:true;';
            return `${s};`;
        }
        case 'email': {
            const to = els.emailTo.value.trim();
            if (!to) return '';
            const params = [];
            if (els.emailSubject.value) params.push(`subject=${encodeURIComponent(els.emailSubject.value)}`);
            if (els.emailBody.value) params.push(`body=${encodeURIComponent(els.emailBody.value)}`);
            return `mailto:${to}${params.length ? `?${params.join('&')}` : ''}`;
        }
        case 'phone': {
            const number = els.phone.value.replace(/[^\d+]/g, '');
            return number ? `tel:${number}` : '';
        }
        default:
            return els.text.value;
    }
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colourWarning() {
    const fg = luminance(els.fg.value);
    if (els.transparent.checked) {
        return fg > 0.4 ? 'A light code on a transparent background only scans when placed on something dark, and some apps still won\'t read it.' : '';
    }
    const bg = luminance(els.bg.value);
    if (fg >= bg) return 'Light codes on a dark background don\'t scan in some camera apps. Dark on light is safest.';
    if ((bg + 0.05) / (fg + 0.05) < 3) return 'The colours are close together, so some phones may struggle to scan this.';
    return '';
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function build() {
    const data = payload();
    code = null;
    if (!data) return '';
    try {
        const qr = qrcode(0, els.ecc.value);
        qr.addData(data);
        qr.make();
        code = { count: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
        return '';
    } catch {
        return 'That is too much to fit in a QR code. Shorten it, or lower the error correction.';
    }
}

// Draws the code onto a canvas `size` pixels square. Module edges are rounded
// to whole pixels so there are no hairline gaps between them.
function drawTo(canvas, size) {
    const margin = Number(els.margin.value);
    const total = code.count + margin * 2;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    if (!els.transparent.checked) {
        ctx.fillStyle = els.bg.value;
        ctx.fillRect(0, 0, size, size);
    }
    ctx.fillStyle = els.fg.value;
    const edge = (i) => Math.round((i * size) / total);
    for (let r = 0; r < code.count; r++) {
        for (let c = 0; c < code.count; c++) {
            if (!code.isDark(r, c)) continue;
            const x = edge(c + margin);
            const y = edge(r + margin);
            ctx.fillRect(x, y, edge(c + margin + 1) - x, edge(r + margin + 1) - y);
        }
    }
}

function toSvg() {
    const margin = Number(els.margin.value);
    const total = code.count + margin * 2;
    let path = '';
    for (let r = 0; r < code.count; r++) {
        for (let c = 0; c < code.count; c++) {
            if (code.isDark(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
        }
    }
    const size = Number(els.size.value);
    const bg = els.transparent.checked ? '' : `<rect width="${total}" height="${total}" fill="${els.bg.value}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges">${bg}<path fill="${els.fg.value}" d="${path}"/></svg>\n`;
}

function render() {
    const error = build();
    els.sizeLabel.textContent = `${els.size.value} px`;
    const ready = !!code;
    for (const b of [els.png, els.svg, els.copy]) b.disabled = !ready;
    els.preview.parentElement.classList.toggle('is-empty', !ready);
    els.message.textContent = error || (ready ? colourWarning() : '');

    if (ready) {
        // One canvas pixel per module; CSS scales it up crisply.
        const margin = Number(els.margin.value);
        drawTo(els.preview, code.count + margin * 2);
    } else {
        const ctx = els.preview.getContext('2d');
        ctx.clearRect(0, 0, els.preview.width, els.preview.height);
    }
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

function pngBlob() {
    const canvas = document.createElement('canvas');
    drawTo(canvas, Number(els.size.value));
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const fileBase = () => ({ wifi: 'wifi-qr', email: 'email-qr', phone: 'phone-qr' }[kind] || 'qr-code');

els.png.addEventListener('click', async () => {
    if (code) save(await pngBlob(), `${fileBase()}.png`);
});

els.svg.addEventListener('click', () => {
    if (code) save(new Blob([toSvg()], { type: 'image/svg+xml' }), `${fileBase()}.svg`);
});

els.copy.addEventListener('click', async () => {
    if (!code) return;
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]);
        els.copy.textContent = 'Copied';
    } catch {
        els.copy.textContent = 'Copy not supported here';
    }
    setTimeout(() => { els.copy.textContent = 'Copy image'; }, 2000);
});

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function setKind(next) {
    kind = next;
    for (const t of els.tabs) t.setAttribute('aria-selected', String(t.dataset.kind === kind));
    for (const f of els.forms) f.hidden = f.dataset.form !== kind;
    render();
}

for (const t of els.tabs) t.addEventListener('click', () => setKind(t.dataset.kind));

document.querySelector('.tool-layout').addEventListener('input', render);
document.querySelector('.tool-layout').addEventListener('change', render);
els.wifiType.addEventListener('change', () => {
    els.wifiPass.disabled = els.wifiType.value === 'nopass';
});

render();
