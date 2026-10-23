# Arisphere Tools

Free browser-based tools from [arisphere.net](https://arisphere.net). Every tool runs entirely in the browser: files are opened and processed in the visitor's tab and are never uploaded.

The tools are listed on the portfolio's [Free Tools page](https://arisphere.net/free-tools), which is the only place ads appear. The tool pages themselves have no ads, analytics or third-party requests.

## Tools

| Tool | Folder | What it does |
| --- | --- | --- |
| PDF Editor | [`pdf-editor/`](pdf-editor/) | Merge PDFs, reorder, rotate and delete pages, and add text, highlights, freehand drawing, images (such as a signature) and white-out boxes. |
| QR Code Generator | [`qr-code/`](qr-code/) | QR codes for links, text, Wi-Fi, email and phone numbers, with colours and error correction. Downloads PNG or SVG. |
| Favicon Generator | [`favicon/`](favicon/) | Builds favicon.ico, PNG icons, an Apple touch icon and a web app manifest from an image, a letter or emoji, or pixel art drawn on a grid. |

## Layout

```
index.html          Landing page that lists every tool
assets/site.css     Shared colours, header, buttons (matches arisphere.net)
assets/brand/       Logo and favicons
vendor/             Third-party libraries, served from this site (no CDNs)
<tool-name>/        One folder per tool, each with its own index.html
```

There is no build step. Everything is plain HTML, CSS and JavaScript modules, so any static host works.

## Running locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/. Opening the files directly with `file://` does not work, because the browser blocks JavaScript modules and web workers there.

## Adding a tool

1. Create a folder, for example `image-resizer/`, with an `index.html` that links `../assets/site.css` and uses the same `site-header`.
2. Keep all processing in the browser. Put any library in `vendor/` rather than loading it from a CDN, and keep the Content-Security-Policy meta tag so nothing can be sent elsewhere.
3. Add a card for it to `index.html` here and to `free-tools.html` in the portfolio repo.
4. Do not add ads or analytics to tool pages. Ads live only on arisphere.net/free-tools.

## Hosting

The site is meant for GitHub Pages: Settings > Pages > Deploy from a branch > `main` / root. Each tool is then at `https://arifreyrg.github.io/arisphere-tools/<tool-name>/`. A custom domain such as `tools.arisphere.net` can be added later with a `CNAME` file and a DNS record.

## Third-party libraries

- [pdf.js](https://github.com/mozilla/pdf.js) 4.10.38 (Apache 2.0), in `vendor/pdfjs/`, renders pages.
- [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1 (MIT), in `vendor/pdf-lib/`, writes the edited PDF.
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 (MIT), in `vendor/qrcode-generator/`, encodes QR codes. Its licence is in the file header.
- [fflate](https://github.com/101arrowz/fflate) 0.8.2 (MIT), in `vendor/fflate/`, zips the favicon files.

Licence files are kept next to them.
