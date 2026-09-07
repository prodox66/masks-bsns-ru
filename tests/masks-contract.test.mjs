import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..');
const MASK_DIRECTORY = path.join(REPOSITORY_ROOT, 'NewUI', 'masks');
const MASK_DATA_DIRECTORY = path.join(MASK_DIRECTORY, 'data');
const MASK_INDEX_FILE = path.join(MASK_DIRECTORY, 'files.js');
const INDEX_GLOBAL_KEY = 'BZNReadyMaskFiles';
const DATA_GLOBAL_KEY = 'BZNReadyMaskData';
const SUPPORTED_EXTENSIONS = new Set(Object.freeze(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']));
const DATA_INDEX_WIDTH = 3;
const DATA_SCRIPT_EXTENSION = '.js';
const TEXT_ENCODING = 'utf8';
const EXPECTED_PAGE_SIZE = 30;

// Function: the filesystem is the independent source used to verify the generated index.
async function sourceMaskNames() {
    const entries = await readdir(MASK_DIRECTORY, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right, 'ru', { numeric: true, sensitivity: 'base' }));
}

// Function: classic generated scripts are evaluated in an isolated browser-like object.
function evaluateGlobal(source, globalKey, filename) {
    const sandbox = { window: {} };
    vm.runInNewContext(source, sandbox, { filename });
    return sandbox.window[globalKey];
}

const [sourceNames, indexSource, runtimeSource, gallerySource, rootEntries] = await Promise.all([
    sourceMaskNames(),
    readFile(MASK_INDEX_FILE, TEXT_ENCODING),
    readFile(path.join(REPOSITORY_ROOT, 'runtime-config.js'), TEXT_ENCODING),
    readFile(path.join(REPOSITORY_ROOT, 'mask-gallery.js'), TEXT_ENCODING),
    readdir(REPOSITORY_ROOT),
]);
const indexedNames = Array.from(evaluateGlobal(indexSource, INDEX_GLOBAL_KEY, MASK_INDEX_FILE) || {});

assert.equal(sourceNames.length, 114, 'the real source set must contain all 114 accepted masks');
assert.deepEqual(indexedNames.toSorted(), sourceNames.toSorted(), 'the index must contain each source mask exactly once');
assert.equal(new Set(indexedNames).size, indexedNames.length, 'the index must not contain duplicates');
assert.match(runtimeSource, new RegExp(`const PAGE_SIZE = ${EXPECTED_PAGE_SIZE};`), 'page size must stay centralized at 30');
assert.match(runtimeSource, /https:\/\/library-ui\.bsns\.ru\//, 'shared interface URL must be centralized');
assert.match(runtimeSource, /NewUI\/masks\//, 'public directory must preserve the Canvas path contract');
assert.match(gallerySource, /class MaskLibrarySite/, 'the gallery must keep one object owner');
assert.equal(rootEntries.some((name) => name.toLowerCase().endsWith('.php')), false, 'the content site must stay static');

for (let index = 0; index < indexedNames.length; index += 1) {
    // Loop: every lazy data payload must decode to the exact bytes of its indexed mask.
    const name = indexedNames[index];
    const dataName = `${String(index).padStart(DATA_INDEX_WIDTH, '0')}${DATA_SCRIPT_EXTENSION}`;
    const [sourceBytes, dataSource] = await Promise.all([
        readFile(path.join(MASK_DIRECTORY, name)),
        readFile(path.join(MASK_DATA_DIRECTORY, dataName), TEXT_ENCODING),
    ]);
    const record = evaluateGlobal(dataSource, DATA_GLOBAL_KEY, dataName);
    const payload = String(record?.dataUrl || '').split(',').at(-1) || '';
    assert.equal(record?.name, name, `data record ${dataName} must keep its indexed filename`);
    assert.equal(Buffer.from(payload, 'base64').equals(sourceBytes), true, `data record ${dataName} must match ${name}`);
}

console.log(`Masks contract passed: ${indexedNames.length} real masks and ${indexedNames.length} exact lazy payloads.`);
