// BZN-FILE-PURPOSE-20260904: build-ready-mask-data.mjs — creates lazy file-safe data scripts for bundled ready masks.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const NEW_UI_DIRECTORY = path.resolve(import.meta.dirname, '..');
const MASK_DIRECTORY = path.join(NEW_UI_DIRECTORY, 'masks');
const MASK_INDEX_FILE = path.join(MASK_DIRECTORY, 'files.js');
const OUTPUT_DIRECTORY = path.join(MASK_DIRECTORY, 'data');
const FILES_GLOBAL_KEY = 'BZNReadyMaskFiles';
const DATA_GLOBAL_KEY = 'BZNReadyMaskData';
const OUTPUT_INDEX_WIDTH = 3;
const OUTPUT_EXTENSION = '.js';
const TEXT_ENCODING = 'utf8';
const BASE64_ENCODING = 'base64';
const INDEX_HEADER = '// Generated read-only data: every supported asset currently stored in NewUI/masks.';
const MIME_BY_EXTENSION = Object.freeze({
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
});

// Function: every supported image currently found in the FTP-managed directory enters one deterministic index.
async function discoveredMaskNames() {
    const entries = await readdir(MASK_DIRECTORY, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && MIME_BY_EXTENSION[path.extname(entry.name).toLowerCase()])
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right, 'ru', { numeric: true, sensitivity: 'base' }));
}

// Function: the browser-readable classic script is rebuilt from the actual directory rather than a hand-maintained list.
async function writeMaskIndex(maskNames) {
    const source = `${INDEX_HEADER}\n(() => {\n    'use strict';\n\n    const GLOBAL_KEY = ${JSON.stringify(FILES_GLOBAL_KEY)};\n    const FILES = Object.freeze(${JSON.stringify(maskNames, null, 4)});\n    window[GLOBAL_KEY] = FILES;\n})();\n`;
    await writeFile(MASK_INDEX_FILE, source, TEXT_ENCODING);
}

// Function: one source image becomes one lazy classic script accepted by direct file pages.
async function writeMaskDataFile(name, fileIndex) {
    const extension = path.extname(name).toLowerCase();
    const mime = MIME_BY_EXTENSION[extension];
    if (!mime) throw new Error(`Unsupported ready-mask extension: ${extension}`);
    const sourceBytes = await readFile(path.join(MASK_DIRECTORY, name));
    const record = Object.freeze({ name, dataUrl: `data:${mime};base64,${sourceBytes.toString(BASE64_ENCODING)}` });
    const outputName = `${String(fileIndex).padStart(OUTPUT_INDEX_WIDTH, '0')}${OUTPUT_EXTENSION}`;
    const outputSource = `// Generated ready-mask payload.\nwindow[${JSON.stringify(DATA_GLOBAL_KEY)}] = Object.freeze(${JSON.stringify(record)});\n`;
    await writeFile(path.join(OUTPUT_DIRECTORY, outputName), outputSource, TEXT_ENCODING);
    return sourceBytes.length;
}

const maskNames = await discoveredMaskNames();
await writeMaskIndex(maskNames);
await mkdir(OUTPUT_DIRECTORY, { recursive: true });
let sourceByteCount = 0;
for (let fileIndex = 0; fileIndex < maskNames.length; fileIndex += 1) {
    // Loop: each gallery index maps deterministically to one independently loadable data script.
    sourceByteCount += await writeMaskDataFile(maskNames[fileIndex], fileIndex);
}

console.log(`Ready-mask data generated: ${maskNames.length} files, ${sourceByteCount} source bytes.`);
