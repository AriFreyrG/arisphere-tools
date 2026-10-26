// Devices and models for the LLM Fit Checker. All numbers are public specs
// rounded to what matters for the estimate. To add a device or a model, add a
// line here; nothing else needs to change.
//
// Device fields:
//   memory     GB of RAM or VRAM
//   bandwidth  GB/s of memory bandwidth (this sets generation speed)
//   kind       'apple' | 'gpu' | 'mobile' | 'cpu' | 'unified'
//   usable     optional GB a model can actually use; otherwise worked out from kind
//
// Model fields:
//   params     billions of parameters in total (all of it must fit in memory)
//   active     billions used per token, for mixture-of-experts models (sets speed)
//   kv         attention shape for the context cache:
//              { layers, heads (KV heads), dim (head size), global, window }
//              global/window describe sliding-window models: only `global`
//              layers keep the whole context, the rest keep `window` tokens.
//   kvBytes    bytes of cache per token, for models with compressed attention
//   nativeBits weights ship at this precision, so bigger quants don't apply
//   hf         Hugging Face repo id

export const UPDATED = 'October 2026';

const mac = [];
function macChip(chip, variants) {
    for (const [memory, bandwidth] of variants) {
        mac.push({
            id: `mac-${chip.toLowerCase().replace(/\s+/g, '-')}-${memory}`,
            name: `${chip}, ${memory} GB`,
            group: 'Mac (Apple silicon)',
            keywords: 'apple mac macbook air pro mini studio imac',
            kind: 'apple',
            memory,
            bandwidth,
        });
    }
}
macChip('M1', [[8, 68], [16, 68]]);
macChip('M1 Pro', [[16, 200], [32, 200]]);
macChip('M1 Max', [[32, 400], [64, 400]]);
macChip('M1 Ultra', [[64, 800], [128, 800]]);
macChip('M2', [[8, 100], [16, 100], [24, 100]]);
macChip('M2 Pro', [[16, 200], [32, 200]]);
macChip('M2 Max', [[32, 400], [64, 400], [96, 400]]);
macChip('M2 Ultra', [[64, 800], [128, 800], [192, 800]]);
macChip('M3', [[8, 100], [16, 100], [24, 100]]);
macChip('M3 Pro', [[18, 150], [36, 150]]);
macChip('M3 Max', [[36, 300], [48, 400], [64, 400], [96, 300], [128, 400]]);
macChip('M3 Ultra', [[96, 819], [256, 819], [512, 819]]);
macChip('M4', [[16, 120], [24, 120], [32, 120]]);
macChip('M4 Pro', [[24, 273], [48, 273], [64, 273]]);
macChip('M4 Max', [[36, 410], [48, 546], [64, 546], [128, 546]]);
macChip('M5', [[16, 153], [24, 153], [32, 153]]);

const d = (group, kind, keywords, list) =>
    list.map(([id, name, memory, bandwidth, usable]) => ({ id, name, group, kind, keywords, memory, bandwidth, usable }));

export const DEVICES = [
    ...mac,

    ...d('iPhone and iPad', 'mobile', 'apple ios phone tablet', [
        ['iphone-13-pro', 'iPhone 13 Pro / Pro Max', 6, 42],
        ['iphone-14-pro', 'iPhone 14 Pro / Pro Max', 6, 51],
        ['iphone-15', 'iPhone 15 / 15 Plus', 6, 51],
        ['iphone-15-pro', 'iPhone 15 Pro / Pro Max', 8, 51],
        ['iphone-16', 'iPhone 16 / 16 Plus / 16e', 8, 60],
        ['iphone-16-pro', 'iPhone 16 Pro / Pro Max', 8, 60],
        ['iphone-17', 'iPhone 17', 8, 68],
        ['iphone-air', 'iPhone Air', 12, 68],
        ['iphone-17-pro', 'iPhone 17 Pro / Pro Max', 12, 68],
        ['ipad-mini-a17', 'iPad mini (A17 Pro)', 8, 51],
        ['ipad-air-m3', 'iPad Air (M2 or M3)', 8, 100],
        ['ipad-pro-m4-8', 'iPad Pro M4, 8 GB', 8, 120],
        ['ipad-pro-m4-16', 'iPad Pro M4, 16 GB (1 TB+)', 16, 120],
        ['ipad-pro-m5-12', 'iPad Pro M5, 12 GB', 12, 153],
        ['ipad-pro-m5-16', 'iPad Pro M5, 16 GB (1 TB+)', 16, 153],
    ]),

    ...d('Android phones', 'mobile', 'android phone samsung galaxy google pixel oneplus snapdragon', [
        ['galaxy-s24-ultra', 'Samsung Galaxy S24 Ultra, 12 GB', 12, 68],
        ['galaxy-s25-ultra-12', 'Samsung Galaxy S25 Ultra, 12 GB', 12, 85],
        ['galaxy-s25-ultra-16', 'Samsung Galaxy S25 Ultra, 16 GB', 16, 85],
        ['pixel-9-pro', 'Google Pixel 9 Pro, 16 GB', 16, 68],
        ['oneplus-13-24', 'OnePlus 13, 24 GB', 24, 85],
        ['android-8', 'Other Android phone, 8 GB', 8, 51],
    ]),

    ...d('NVIDIA GeForce', 'gpu', 'nvidia geforce rtx gpu graphics card cuda', [
        ['rtx-3060-12', 'RTX 3060, 12 GB', 12, 360],
        ['rtx-3060-ti', 'RTX 3060 Ti, 8 GB', 8, 448],
        ['rtx-3070', 'RTX 3070, 8 GB', 8, 448],
        ['rtx-3080-10', 'RTX 3080, 10 GB', 10, 760],
        ['rtx-3080-12', 'RTX 3080, 12 GB', 12, 912],
        ['rtx-3090', 'RTX 3090, 24 GB', 24, 936],
        ['rtx-3090-ti', 'RTX 3090 Ti, 24 GB', 24, 1008],
        ['rtx-4060', 'RTX 4060, 8 GB', 8, 272],
        ['rtx-4060-ti-8', 'RTX 4060 Ti, 8 GB', 8, 288],
        ['rtx-4060-ti-16', 'RTX 4060 Ti, 16 GB', 16, 288],
        ['rtx-4070', 'RTX 4070 / 4070 Super, 12 GB', 12, 504],
        ['rtx-4070-ti', 'RTX 4070 Ti, 12 GB', 12, 504],
        ['rtx-4070-ti-super', 'RTX 4070 Ti Super, 16 GB', 16, 672],
        ['rtx-4080', 'RTX 4080 / 4080 Super, 16 GB', 16, 736],
        ['rtx-4090', 'RTX 4090, 24 GB', 24, 1008],
        ['rtx-5060', 'RTX 5060, 8 GB', 8, 448],
        ['rtx-5060-ti-16', 'RTX 5060 Ti, 16 GB', 16, 448],
        ['rtx-5070', 'RTX 5070, 12 GB', 12, 672],
        ['rtx-5070-ti', 'RTX 5070 Ti, 16 GB', 16, 896],
        ['rtx-5080', 'RTX 5080, 16 GB', 16, 960],
        ['rtx-5090', 'RTX 5090, 32 GB', 32, 1792],
        ['rtx-4060-laptop', 'RTX 4060 Laptop, 8 GB', 8, 256],
        ['rtx-4070-laptop', 'RTX 4070 Laptop, 8 GB', 8, 256],
        ['rtx-4080-laptop', 'RTX 4080 Laptop, 12 GB', 12, 432],
        ['rtx-4090-laptop', 'RTX 4090 Laptop, 16 GB', 16, 576],
        ['rtx-5090-laptop', 'RTX 5090 Laptop, 24 GB', 24, 896],
    ]),

    ...d('NVIDIA workstation and data center', 'gpu', 'nvidia gpu cuda server cloud datacenter', [
        ['rtx-a6000', 'RTX A6000, 48 GB', 48, 768],
        ['rtx-6000-ada', 'RTX 6000 Ada, 48 GB', 48, 960],
        ['rtx-pro-6000', 'RTX PRO 6000 Blackwell, 96 GB', 96, 1792],
        ['l40s', 'L40S, 48 GB', 48, 864],
        ['a100-40', 'A100, 40 GB', 40, 1555],
        ['a100-80', 'A100, 80 GB', 80, 2039],
        ['h100-pcie', 'H100 PCIe, 80 GB', 80, 2000],
        ['h100-sxm', 'H100 SXM, 80 GB', 80, 3350],
        ['h200', 'H200, 141 GB', 141, 4800],
        ['b200', 'B200, 192 GB', 192, 8000],
    ]),

    ...d('AMD and Intel graphics', 'gpu', 'amd radeon intel arc gpu graphics card rocm vulkan', [
        ['rx-7600', 'Radeon RX 7600, 8 GB', 8, 288],
        ['rx-7800-xt', 'Radeon RX 7800 XT, 16 GB', 16, 624],
        ['rx-7900-xt', 'Radeon RX 7900 XT, 20 GB', 20, 800],
        ['rx-7900-xtx', 'Radeon RX 7900 XTX, 24 GB', 24, 960],
        ['rx-9060-xt', 'Radeon RX 9060 XT, 16 GB', 16, 322],
        ['rx-9070-xt', 'Radeon RX 9070 / 9070 XT, 16 GB', 16, 644],
        ['arc-a770', 'Intel Arc A770, 16 GB', 16, 560],
        ['arc-b580', 'Intel Arc B580, 12 GB', 12, 456],
    ]),

    ...d('AI mini PCs and boards', 'unified', 'unified memory mini pc box board edge', [
        ['strix-halo-64', 'AMD Ryzen AI Max+ 395, 64 GB', 64, 256, 48],
        ['strix-halo-128', 'AMD Ryzen AI Max+ 395, 128 GB', 128, 256, 96],
        ['dgx-spark', 'NVIDIA DGX Spark, 128 GB', 128, 273, 115],
        ['jetson-orin-nano', 'NVIDIA Jetson Orin Nano Super, 8 GB', 8, 102, 6],
        ['jetson-agx-orin', 'NVIDIA Jetson AGX Orin, 64 GB', 64, 205, 56],
        ['rpi5-8', 'Raspberry Pi 5, 8 GB', 8, 17, 6],
        ['rpi5-16', 'Raspberry Pi 5, 16 GB', 16, 17, 13],
    ]),

    ...d('PC without a graphics card (CPU only)', 'cpu', 'pc windows linux laptop desktop cpu ram memory ddr', [
        ['ddr4-16', 'Desktop, 16 GB DDR4', 16, 51],
        ['ddr4-32', 'Desktop, 32 GB DDR4', 32, 51],
        ['ddr4-64', 'Desktop, 64 GB DDR4', 64, 51],
        ['ddr5-32', 'Desktop, 32 GB DDR5', 32, 90],
        ['ddr5-64', 'Desktop, 64 GB DDR5', 64, 90],
        ['ddr5-96', 'Desktop, 96 GB DDR5', 96, 90],
        ['ddr5-128', 'Desktop, 128 GB DDR5', 128, 90],
        ['laptop-16', 'Laptop, 16 GB (Snapdragon X, Core Ultra, Ryzen AI)', 16, 120],
        ['laptop-32', 'Laptop, 32 GB (Snapdragon X, Core Ultra, Ryzen AI)', 32, 120],
    ]),
];

// Bits per weight for common GGUF quantizations, including the parts of the
// model that are kept at higher precision.
export const QUANTS = [
    { id: 'Q3_K_M', bits: 3.9, note: 'Smallest that still works well. Noticeably less accurate.' },
    { id: 'Q4_K_M', bits: 4.85, note: 'The usual choice. Close to full quality at about a third of the size.' },
    { id: 'Q5_K_M', bits: 5.7, note: 'A little more accurate than Q4, a little bigger and slower.' },
    { id: 'Q6_K', bits: 6.6, note: 'Very close to the original model.' },
    { id: 'Q8_0', bits: 8.5, note: 'Practically identical to the original, twice the size of Q4.' },
    { id: 'F16', bits: 16, note: 'Full 16-bit weights, as the model was trained.' },
];

const llama = (layers, heads = 8, dim = 128) => ({ layers, heads, dim });

export const MODELS = [
    // Meta Llama
    { name: 'Llama 3.2 1B', maker: 'Meta', params: 1.24, kv: llama(16, 8, 64), hf: 'meta-llama/Llama-3.2-1B-Instruct', tags: 'chat small' },
    { name: 'Llama 3.2 3B', maker: 'Meta', params: 3.21, kv: llama(28), hf: 'meta-llama/Llama-3.2-3B-Instruct', tags: 'chat small' },
    { name: 'Llama 3.1 8B', maker: 'Meta', params: 8.03, kv: llama(32), hf: 'meta-llama/Llama-3.1-8B-Instruct', tags: 'chat' },
    { name: 'Llama 3.3 70B', maker: 'Meta', params: 70.6, kv: llama(80), hf: 'meta-llama/Llama-3.3-70B-Instruct', tags: 'chat' },
    { name: 'Llama 3.1 405B', maker: 'Meta', params: 405, kv: llama(126), hf: 'meta-llama/Llama-3.1-405B-Instruct', tags: 'chat' },
    { name: 'Llama 4 Scout', maker: 'Meta', params: 109, active: 17, kv: { layers: 48, heads: 8, dim: 128, global: 12, window: 8192 }, hf: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', tags: 'chat vision moe' },
    { name: 'Llama 4 Maverick', maker: 'Meta', params: 400, active: 17, kv: { layers: 48, heads: 8, dim: 128, global: 12, window: 8192 }, hf: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', tags: 'chat vision moe' },

    // Qwen
    { name: 'Qwen3 0.6B', maker: 'Alibaba Qwen', params: 0.6, kv: llama(28), hf: 'Qwen/Qwen3-0.6B', tags: 'chat reasoning small' },
    { name: 'Qwen3 1.7B', maker: 'Alibaba Qwen', params: 1.7, kv: llama(28), hf: 'Qwen/Qwen3-1.7B', tags: 'chat reasoning small' },
    { name: 'Qwen3 4B 2507', maker: 'Alibaba Qwen', params: 4.0, kv: llama(36), hf: 'Qwen/Qwen3-4B-Instruct-2507', tags: 'chat small' },
    { name: 'Qwen3 8B', maker: 'Alibaba Qwen', params: 8.2, kv: llama(36), hf: 'Qwen/Qwen3-8B', tags: 'chat reasoning' },
    { name: 'Qwen3 14B', maker: 'Alibaba Qwen', params: 14.8, kv: llama(40), hf: 'Qwen/Qwen3-14B', tags: 'chat reasoning' },
    { name: 'Qwen3 32B', maker: 'Alibaba Qwen', params: 32.8, kv: llama(64), hf: 'Qwen/Qwen3-32B', tags: 'chat reasoning' },
    { name: 'Qwen3 30B-A3B 2507', maker: 'Alibaba Qwen', params: 30.5, active: 3.3, kv: llama(48, 4), hf: 'Qwen/Qwen3-30B-A3B-Instruct-2507', tags: 'chat moe' },
    { name: 'Qwen3 Coder 30B-A3B', maker: 'Alibaba Qwen', params: 30.5, active: 3.3, kv: llama(48, 4), hf: 'Qwen/Qwen3-Coder-30B-A3B-Instruct', tags: 'code moe' },
    { name: 'Qwen3 Next 80B-A3B', maker: 'Alibaba Qwen', params: 80, active: 3, kv: { layers: 12, heads: 2, dim: 256 }, hf: 'Qwen/Qwen3-Next-80B-A3B-Instruct', tags: 'chat moe' },
    { name: 'Qwen3 235B-A22B 2507', maker: 'Alibaba Qwen', params: 235, active: 22, kv: llama(94, 4), hf: 'Qwen/Qwen3-235B-A22B-Instruct-2507', tags: 'chat moe' },
    { name: 'Qwen3 Coder 480B-A35B', maker: 'Alibaba Qwen', params: 480, active: 35, kv: llama(62), hf: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', tags: 'code moe' },
    { name: 'Qwen2.5 7B', maker: 'Alibaba Qwen', params: 7.6, kv: llama(28, 4), hf: 'Qwen/Qwen2.5-7B-Instruct', tags: 'chat' },
    { name: 'Qwen2.5 Coder 32B', maker: 'Alibaba Qwen', params: 32.8, kv: llama(64), hf: 'Qwen/Qwen2.5-Coder-32B-Instruct', tags: 'code' },

    // Google Gemma
    { name: 'Gemma 3 270M', maker: 'Google', params: 0.27, kv: { layers: 18, heads: 1, dim: 256, global: 3, window: 512 }, hf: 'google/gemma-3-270m-it', tags: 'small' },
    { name: 'Gemma 3 1B', maker: 'Google', params: 1.0, kv: { layers: 26, heads: 1, dim: 256, global: 4, window: 512 }, hf: 'google/gemma-3-1b-it', tags: 'chat small' },
    { name: 'Gemma 3 4B', maker: 'Google', params: 4.3, kv: { layers: 34, heads: 4, dim: 256, global: 6, window: 1024 }, hf: 'google/gemma-3-4b-it', tags: 'chat vision small' },
    { name: 'Gemma 3 12B', maker: 'Google', params: 12.2, kv: { layers: 48, heads: 8, dim: 256, global: 8, window: 1024 }, hf: 'google/gemma-3-12b-it', tags: 'chat vision' },
    { name: 'Gemma 3 27B', maker: 'Google', params: 27.4, kv: { layers: 62, heads: 16, dim: 128, global: 10, window: 1024 }, hf: 'google/gemma-3-27b-it', tags: 'chat vision' },

    // OpenAI
    { name: 'gpt-oss 20B', maker: 'OpenAI', params: 21, active: 3.6, nativeBits: 4.25, kv: { layers: 24, heads: 8, dim: 64, global: 12, window: 128 }, hf: 'openai/gpt-oss-20b', tags: 'chat reasoning moe' },
    { name: 'gpt-oss 120B', maker: 'OpenAI', params: 117, active: 5.1, nativeBits: 4.25, kv: { layers: 36, heads: 8, dim: 64, global: 18, window: 128 }, hf: 'openai/gpt-oss-120b', tags: 'chat reasoning moe' },

    // Mistral
    { name: 'Mistral 7B v0.3', maker: 'Mistral AI', params: 7.25, kv: llama(32), hf: 'mistralai/Mistral-7B-Instruct-v0.3', tags: 'chat' },
    { name: 'Mistral Nemo 12B', maker: 'Mistral AI', params: 12.2, kv: llama(40), hf: 'mistralai/Mistral-Nemo-Instruct-2407', tags: 'chat' },
    { name: 'Mistral Small 3.2 24B', maker: 'Mistral AI', params: 24, kv: llama(40), hf: 'mistralai/Mistral-Small-3.2-24B-Instruct-2506', tags: 'chat vision' },
    { name: 'Magistral Small 24B', maker: 'Mistral AI', params: 24, kv: llama(40), hf: 'mistralai/Magistral-Small-2506', tags: 'reasoning' },
    { name: 'Devstral Small 24B', maker: 'Mistral AI', params: 24, kv: llama(40), hf: 'mistralai/Devstral-Small-2507', tags: 'code' },
    { name: 'Mixtral 8x7B', maker: 'Mistral AI', params: 46.7, active: 12.9, kv: llama(32), hf: 'mistralai/Mixtral-8x7B-Instruct-v0.1', tags: 'chat moe' },

    // Microsoft
    { name: 'Phi-4 mini 3.8B', maker: 'Microsoft', params: 3.8, kv: llama(32), hf: 'microsoft/Phi-4-mini-instruct', tags: 'chat small' },
    { name: 'Phi-4 14B', maker: 'Microsoft', params: 14.7, kv: llama(40, 10), hf: 'microsoft/phi-4', tags: 'chat' },

    // DeepSeek
    { name: 'DeepSeek R1 0528 Qwen3 8B', maker: 'DeepSeek', params: 8.2, kv: llama(36), hf: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B', tags: 'reasoning' },
    { name: 'DeepSeek R1 Distill Qwen 14B', maker: 'DeepSeek', params: 14.8, kv: llama(48), hf: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B', tags: 'reasoning' },
    { name: 'DeepSeek R1 Distill Qwen 32B', maker: 'DeepSeek', params: 32.8, kv: llama(64), hf: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B', tags: 'reasoning' },
    { name: 'DeepSeek R1 Distill Llama 70B', maker: 'DeepSeek', params: 70.6, kv: llama(80), hf: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B', tags: 'reasoning' },
    { name: 'DeepSeek V3.1', maker: 'DeepSeek', params: 671, active: 37, nativeBits: 8.5, kvBytes: 70272, hf: 'deepseek-ai/DeepSeek-V3.1', tags: 'chat reasoning moe' },
    { name: 'DeepSeek R1 0528', maker: 'DeepSeek', params: 671, active: 37, nativeBits: 8.5, kvBytes: 70272, hf: 'deepseek-ai/DeepSeek-R1-0528', tags: 'reasoning moe' },

    // Others
    { name: 'GLM-4.5 Air', maker: 'Z.ai', params: 106, active: 12, kv: llama(46), hf: 'zai-org/GLM-4.5-Air', tags: 'chat code moe' },
    { name: 'GLM-4.5', maker: 'Z.ai', params: 355, active: 32, kv: llama(92), hf: 'zai-org/GLM-4.5', tags: 'chat code moe' },
    { name: 'Kimi K2', maker: 'Moonshot AI', params: 1000, active: 32, nativeBits: 8.5, kvBytes: 70272, hf: 'moonshotai/Kimi-K2-Instruct', tags: 'chat code moe' },
    { name: 'SmolLM3 3B', maker: 'Hugging Face', params: 3.1, kv: llama(36, 4), hf: 'HuggingFaceTB/SmolLM3-3B', tags: 'chat reasoning small' },
    { name: 'Granite 3.3 8B', maker: 'IBM', params: 8.2, kv: llama(40), hf: 'ibm-granite/granite-3.3-8b-instruct', tags: 'chat' },
];
