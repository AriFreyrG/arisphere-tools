// Arisphere LLM Fit Checker. Works out which open models fit a device's memory
// and estimates their speed from its memory bandwidth. All data is in data.js;
// nothing is fetched.
import { DEVICES, MODELS, QUANTS, UPDATED } from './data.js';

const $ = (id) => document.getElementById(id);
const els = {
    search: $('device-search'),
    list: $('device-list'),
    facts: $('device-facts'),
    deviceHint: $('device-hint'),
    quant: $('quant'),
    quantNote: $('quant-note'),
    context: $('context'),
    usable: $('usable'),
    bandwidth: $('bandwidth'),
    summary: $('summary'),
    filter: $('model-filter'),
    sort: $('sort'),
    fitsOnly: $('fits-only'),
    models: $('models'),
    updated: $('updated'),
};

const CUSTOM = {
    id: 'custom',
    name: 'Custom device',
    group: 'Other',
    keywords: 'custom other manual',
    kind: 'custom',
    memory: 16,
    bandwidth: 100,
};
const ALL_DEVICES = [...DEVICES, CUSTOM];

// How much of the memory a model can use, and how close to the bandwidth limit
// real apps get, for each kind of device.
// `overhead` is a fixed cost per token in seconds, which is what limits very small models.
const KINDS = {
    // macOS lets the GPU wire about two thirds of RAM, or three quarters above 36 GB.
    apple: { usable: (gb) => gb * (gb > 36 ? 0.75 : 0.67), efficiency: 0.7, overhead: 0.003 },
    gpu: { usable: (gb) => gb * 0.94, efficiency: 0.75, overhead: 0.0015 },
    // Phones keep a lot of memory for the system and will close an app that takes too much.
    mobile: { usable: (gb) => gb * 0.55, efficiency: 0.45, overhead: 0.008 },
    cpu: { usable: (gb) => gb * 0.75, efficiency: 0.5, overhead: 0.005 },
    unified: { usable: (gb) => gb * 0.8, efficiency: 0.6, overhead: 0.003 },
    custom: { usable: (gb) => gb, efficiency: 0.6, overhead: 0.003 },
};

const HINTS = {
    apple: 'On a Mac the GPU can use about 2/3 of the memory by default (3/4 above 36 GB). You can raise it with sudo sysctl iogpu.wired_limit_mb, leaving 4 to 8 GB for macOS.',
    gpu: 'Counts the graphics card memory only. Models that are too big can still run by spilling into system RAM, but much more slowly.',
    mobile: 'Phones and tablets keep a large share of memory for the system, so only about half is counted. Apps such as PocketPal, Private LLM or Locally AI run these models.',
    cpu: 'Running on the processor only. A quarter of the RAM is left for the system and your other apps.',
    unified: 'The CPU and GPU share this memory. The figure counts what is normally given to the GPU.',
    custom: 'Enter the memory a model can use and the memory bandwidth below.',
};

let device = null;
let activeIndex = -1;
let shown = []; // devices currently in the drop-down

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------

const round = (gb) => Math.round(gb * 2) / 2;

function cacheBytes(model, tokens) {
    if (model.kvBytes) return model.kvBytes * tokens;
    const { layers, heads, dim, global, window } = model.kv;
    const perLayerToken = 2 * heads * dim * 2; // keys and values at 16 bits
    const layerTokens = global === undefined
        ? layers * tokens
        : global * tokens + (layers - global) * Math.min(tokens, window);
    return perLayerToken * layerTokens;
}

function estimate(model, quant, context, usable, bandwidth, { efficiency, overhead }) {
    const bits = Math.min(quant.bits, model.nativeBits ?? Infinity);
    const weights = (model.params * bits) / 8;
    const cache = cacheBytes(model, context) / 1e9;
    const need = weights + cache + 0.4 + weights * 0.03;
    const status = need <= usable * 0.9 ? 'fits' : need <= usable ? 'tight' : 'too-big';

    // Each token reads the active weights once, plus the cache so far
    // (on average half the context).
    const active = ((model.active ?? model.params) * bits) / 8;
    // Picking experts costs extra, so mixture-of-experts models get a lower efficiency.
    const moePenalty = model.active ? 0.8 : 1;
    const bytes = active + cacheBytes(model, context / 2) / 1e9;
    const speed = 1 / (bytes / (bandwidth * efficiency * moePenalty) + overhead);

    return { model, bits, weights, need, status, speed, native: bits < quant.bits };
}

// ---------------------------------------------------------------------------
// Device drop-down
// ---------------------------------------------------------------------------

function haystack(dev) {
    return `${dev.name} ${dev.group} ${dev.keywords} ${dev.memory}gb ${dev.memory} gb`.toLowerCase();
}

function matchDevices(query) {
    const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (!words.length) return ALL_DEVICES;
    return ALL_DEVICES.filter((dev) => {
        const text = haystack(dev);
        return words.every((w) => text.includes(w));
    });
}

function renderList() {
    const query = device && els.search.value === device.name ? '' : els.search.value;
    shown = matchDevices(query);
    els.list.replaceChildren();

    if (!shown.length) {
        const li = document.createElement('li');
        li.className = 'combo-empty';
        li.textContent = 'No device matches. Try fewer words, or pick Custom device.';
        els.list.append(li);
        return;
    }

    let group = null;
    shown.forEach((dev, i) => {
        if (dev.group !== group) {
            group = dev.group;
            const head = document.createElement('li');
            head.className = 'combo-group';
            head.setAttribute('role', 'presentation');
            head.textContent = group;
            els.list.append(head);
        }
        const li = document.createElement('li');
        li.className = 'combo-option';
        li.id = `opt-${dev.id}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(dev === device));
        li.dataset.index = i;
        const name = document.createElement('span');
        name.textContent = dev.name;
        const spec = document.createElement('small');
        spec.textContent = dev.kind === 'custom' ? 'your numbers' : `${dev.memory} GB · ${dev.bandwidth} GB/s`;
        li.append(name, spec);
        els.list.append(li);
    });
    setActive(query ? 0 : shown.indexOf(device));
}

function setActive(i) {
    els.list.querySelector('.is-active')?.classList.remove('is-active');
    activeIndex = i;
    const dev = shown[i];
    if (!dev) {
        els.search.removeAttribute('aria-activedescendant');
        return;
    }
    const li = $(`opt-${dev.id}`);
    li.classList.add('is-active');
    li.scrollIntoView({ block: 'nearest' });
    els.search.setAttribute('aria-activedescendant', li.id);
}

function openList() {
    if (!els.list.hidden) return;
    els.list.hidden = false;
    els.search.setAttribute('aria-expanded', 'true');
    renderList();
}

function closeList() {
    els.list.hidden = true;
    els.search.setAttribute('aria-expanded', 'false');
    els.search.removeAttribute('aria-activedescendant');
    if (device) els.search.value = device.name;
}

function selectDevice(dev) {
    device = dev;
    const kind = KINDS[dev.kind];
    els.usable.value = round(dev.usable ?? kind.usable(dev.memory));
    els.bandwidth.value = dev.bandwidth;
    els.search.value = dev.name;
    closeList();
    update();
}

els.search.addEventListener('focus', () => {
    els.search.select();
    openList();
});
els.search.addEventListener('click', openList);
els.search.addEventListener('input', () => {
    if (els.list.hidden) openList();
    else renderList();
});
els.search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openList();
        if (!shown.length) return;
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((activeIndex + step + shown.length) % shown.length);
    } else if (e.key === 'Enter') {
        if (!els.list.hidden && shown[activeIndex]) {
            e.preventDefault();
            selectDevice(shown[activeIndex]);
        }
    } else if (e.key === 'Escape') {
        closeList();
        els.search.select();
    }
});
els.search.addEventListener('blur', () => {
    // Let a click on an option land before the list closes.
    setTimeout(() => {
        if (document.activeElement !== els.search) closeList();
    }, 150);
});
els.list.addEventListener('mousedown', (e) => e.preventDefault());
els.list.addEventListener('click', (e) => {
    const li = e.target.closest('.combo-option');
    if (li) selectDevice(shown[Number(li.dataset.index)]);
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function gb(n) {
    return n < 10 ? `${n.toFixed(1)} GB` : `${Math.round(n)} GB`;
}

function speedWord(tps) {
    if (tps >= 40) return 'fast';
    if (tps >= 15) return 'comfortable';
    if (tps >= 5) return 'slow';
    return 'very slow';
}

function paramsLabel(model) {
    const b = (n) => (n < 1 ? `${Math.round(n * 1000)}M` : `${Number(n.toPrecision(3))}B`);
    return model.active ? `${b(model.params)} total, ${b(model.active)} active` : b(model.params);
}

function hfSearch(model, library) {
    const name = model.hf.split('/')[1];
    return `https://huggingface.co/models?library=${library}&search=${encodeURIComponent(name)}`;
}

function link(href, text) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
}

function renderModel(r, usable, quant) {
    const { model } = r;
    const li = document.createElement('li');
    li.className = `model is-${r.status}`;

    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'model-name';
    name.textContent = model.name;
    if (model.active) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'MoE';
        badge.title = 'Mixture of experts: only part of the model is used for each token';
        name.append(badge);
    }
    const meta = document.createElement('div');
    meta.className = 'model-meta';
    const sizeText = r.native ? `${gb(r.weights)} as shipped` : `${gb(r.weights)} at ${quant.id}`;
    meta.textContent = `${model.maker} · ${paramsLabel(model)} · ${sizeText}`;
    const links = document.createElement('div');
    links.className = 'model-links';
    links.append(link(`https://huggingface.co/${model.hf}`, 'Hugging Face'));
    links.append(link(hfSearch(model, 'gguf'), 'GGUF files'));
    if (device.kind === 'apple' || device.group === 'iPhone and iPad') {
        links.append(link(hfSearch(model, 'mlx'), 'MLX files'));
    }
    info.append(name, meta, links);

    const mem = document.createElement('div');
    mem.className = 'model-mem';
    const label = document.createElement('div');
    label.className = 'mem-label';
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = { fits: 'Fits', tight: 'Tight fit', 'too-big': 'Too big' }[r.status];
    const amount = document.createElement('span');
    amount.textContent = `${gb(r.need)} of ${gb(usable)}`;
    label.append(status, amount);
    const bar = document.createElement('div');
    bar.className = 'mem-bar';
    const fill = document.createElement('span');
    fill.style.width = `${Math.min(100, (r.need / usable) * 100)}%`;
    bar.append(fill);
    mem.append(label, bar);

    const speed = document.createElement('div');
    speed.className = 'speed';
    const value = document.createElement('strong');
    const note = document.createElement('small');
    if (r.status === 'too-big') {
        value.textContent = '-';
        note.textContent = "won't load";
    } else {
        value.textContent = `~${r.speed < 10 ? r.speed.toFixed(1) : Math.round(r.speed)}`;
        note.textContent = `tok/s, ${speedWord(r.speed)}`;
    }
    speed.append(value, note);

    li.append(info, mem, speed);
    return li;
}

const STATUS_ORDER = { fits: 0, tight: 1, 'too-big': 2 };
const SORTS = {
    best: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.model.params - a.model.params,
    speed: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.speed - a.speed,
    size: (a, b) => a.need - b.need,
    name: (a, b) => a.model.name.localeCompare(b.model.name, undefined, { numeric: true }),
};

function renderFacts(usable, bandwidth) {
    const facts = [
        ['Memory', device.kind === 'custom' ? '-' : `${device.memory} GB`],
        ['For models', `${round(usable)} GB`],
        ['Bandwidth', `${bandwidth} GB/s`],
    ];
    els.facts.replaceChildren(...facts.map(([k, v]) => {
        const div = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        div.append(dt, dd);
        return div;
    }));
    els.deviceHint.textContent = HINTS[device.kind];
}

function update() {
    if (!device) return;
    const quant = QUANTS.find((q) => q.id === els.quant.value);
    const context = Number(els.context.value);
    const usable = Math.max(0.5, Number(els.usable.value) || 0.5);
    const bandwidth = Math.max(1, Number(els.bandwidth.value) || 1);

    els.quantNote.textContent = quant.note;
    renderFacts(usable, bandwidth);

    const results = MODELS.map((m) => estimate(m, quant, context, usable, bandwidth, KINDS[device.kind]));
    const fitting = results.filter((r) => r.status !== 'too-big');
    const biggest = fitting.reduce((best, r) => (!best || r.model.params > best.model.params ? r : best), null);

    els.summary.replaceChildren();
    const count = document.createElement('strong');
    count.textContent = `${fitting.length} of ${results.length} models`;
    els.summary.append(count, ` fit on ${device.name} at ${quant.id} with ${els.context.selectedOptions[0].text} of context.`);
    if (biggest) els.summary.append(` The largest is ${biggest.model.name}.`);
    else els.summary.append(' Try a smaller quantization or a shorter context.');

    const words = els.filter.value.toLowerCase().split(/\s+/).filter(Boolean);
    const visible = results
        .filter((r) => !els.fitsOnly.checked || r.status !== 'too-big')
        .filter((r) => {
            const m = r.model;
            const text = `${m.name} ${m.maker} ${m.tags} ${m.hf}`.toLowerCase();
            return words.every((w) => text.includes(w));
        })
        .sort(SORTS[els.sort.value]);

    if (visible.length) {
        els.models.replaceChildren(...visible.map((r) => renderModel(r, usable, quant)));
    } else {
        const li = document.createElement('li');
        li.className = 'models-empty';
        li.textContent = 'No models match the filter.';
        els.models.replaceChildren(li);
    }

    saveState();
}

// ---------------------------------------------------------------------------
// Start-up and shareable links (#device=...&quant=...&ctx=...)
// ---------------------------------------------------------------------------

function saveState() {
    const params = new URLSearchParams({ device: device.id, quant: els.quant.value, ctx: els.context.value });
    history.replaceState(null, '', `#${params}`);
}

function guessDevice() {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iphone-16';
    if (/iPad/.test(ua)) return 'ipad-air-m3';
    if (/Android/.test(ua)) return 'galaxy-s25-ultra-12';
    if (/Macintosh/.test(ua)) return 'mac-m4-24';
    return 'rtx-4070';
}

for (const q of QUANTS) {
    const opt = document.createElement('option');
    opt.value = q.id;
    opt.textContent = q.id;
    els.quant.append(opt);
}
els.quant.value = 'Q4_K_M';
els.updated.textContent = UPDATED;

const saved = new URLSearchParams(location.hash.slice(1));
if (QUANTS.some((q) => q.id === saved.get('quant'))) els.quant.value = saved.get('quant');
if ([...els.context.options].some((o) => o.value === saved.get('ctx'))) els.context.value = saved.get('ctx');

for (const el of [els.quant, els.context, els.sort, els.fitsOnly]) el.addEventListener('change', update);
for (const el of [els.usable, els.bandwidth, els.filter]) el.addEventListener('input', update);

const start = ALL_DEVICES.find((dev) => dev.id === saved.get('device'))
    ?? ALL_DEVICES.find((dev) => dev.id === guessDevice());
selectDevice(start);
