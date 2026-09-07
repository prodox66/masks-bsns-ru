import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const MASK_ROOT = path.resolve(import.meta.dirname, '..');
const INTERFACE_ROOT = path.resolve(MASK_ROOT, '..', 'library-ui-bsns-ru');
const HOST = '127.0.0.1';
const MASK_PORT = 4181;
const INTERFACE_PORT = 4182;
const MASK_URL = `http://${HOST}:${MASK_PORT}/`;
const INTERFACE_URL = `http://${HOST}:${INTERFACE_PORT}/`;
const EXPECTED_COUNT = 114;
const EXPECTED_PAGE_COUNTS = Object.freeze([30, 30, 30, 24]);
const CLEAN_CYCLES = 3;
const MIME_BY_EXTENSION = Object.freeze({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp' });

// Function: one static server exposes only files beneath its explicit repository root.
function staticServer(root, port) {
    const server = http.createServer(async (request, response) => {
        const requestPath = decodeURIComponent(new URL(request.url, `http://${HOST}`).pathname);
        const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
        const filePath = path.resolve(root, relativePath);
        if (!filePath.startsWith(`${root}${path.sep}`)) {
            response.writeHead(403).end();
            return;
        }
        try {
            await access(filePath);
            const fileStat = await stat(filePath);
            if (!fileStat.isFile()) throw new Error('not-file');
            const extension = path.extname(filePath).toLowerCase();
            response.setHeader('Content-Type', MIME_BY_EXTENSION[extension] || 'application/octet-stream');
            response.setHeader('Access-Control-Allow-Origin', '*');
            createReadStream(filePath).pipe(response);
        } catch {
            response.writeHead(404).end();
        }
    });
    return new Promise((resolve) => server.listen(port, HOST, () => resolve(server)));
}

// Function: browser init replaces only host URLs while exercising the real shared UI implementation.
function browserConfiguration() {
    const interfacePaths = Object.freeze({
        resourceLibraryScript: 'assets/resource-library-v2.js',
        resourceLibraryStylesheet: 'assets/resource-library.css',
        libraryWindowScript: 'NewUI/Library_Window.js',
        libraryWindowConfiguration: 'NewUI/windows/library_window.json',
        libraryWindowFileBridge: 'NewUI/windows/library_window.data.js',
        lightboxScript: 'assets/lightbox.js',
        lightboxStylesheet: 'assets/lightbox.css',
    });
    return Object.freeze({
        siteRootUrl: MASK_URL,
        interfaceRootUrl: INTERFACE_URL,
        library: 'masks',
        callerId: 'readyBoxMasks',
        contentType: 'masks',
        pageSize: EXPECTED_PAGE_COUNTS[0],
        maskDirectoryUrl: `${MASK_URL}NewUI/masks/`,
        maskIndexUrl: `${MASK_URL}NewUI/masks/files.js`,
        maskDataDirectoryUrl: `${MASK_URL}NewUI/masks/data/`,
        interface: Object.freeze(Object.fromEntries(Object.entries(interfacePaths).map(([key, value]) => [key, `${INTERFACE_URL}${value}`]))),
    });
}

const servers = await Promise.all([staticServer(MASK_ROOT, MASK_PORT), staticServer(INTERFACE_ROOT, INTERFACE_PORT)]);
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });

try {
    for (let cycle = 1; cycle <= CLEAN_CYCLES; cycle += 1) {
        // Loop: three fresh contexts prove the latest state without cached globals or modal state.
        const context = await browser.newContext();
        await context.addInitScript((configuration) => { window.BZNMaskLibraryConfig = configuration; }, browserConfiguration());
        const page = await context.newPage();
        const runtimeErrors = [];
        page.on('pageerror', (error) => runtimeErrors.push(error.message));
        await page.goto(MASK_URL, { waitUntil: 'networkidle' });
        await page.locator('#openMaskLibrary:not([disabled])').click();
        const modal = page.locator('.bzn-resource-library-modal:not([hidden])');
        await modal.waitFor();
        const pageCounts = [];
        for (let pageIndex = 0; pageIndex < EXPECTED_PAGE_COUNTS.length; pageIndex += 1) {
            // Loop: all four pages retain fixed geometry and expose the exact 30/30/30/24 split.
            const items = modal.locator('.bzn-resource-library-item');
            await items.first().waitFor();
            pageCounts.push(await items.count());
            if (pageIndex < EXPECTED_PAGE_COUNTS.length - 1) await modal.locator('#bznResourceLibraryNext').click();
        }
        assert.deepEqual(pageCounts, EXPECTED_PAGE_COUNTS, `cycle ${cycle}: pagination split`);
        assert.match(await modal.locator('#bznResourceLibraryPage').textContent(), new RegExp(`4 / 4.*${EXPECTED_COUNT}`), `cycle ${cycle}: total label`);
        await modal.locator('#bznResourceLibraryPrev').click();
        await modal.locator('.bzn-resource-library-item').first().click();
        const lightbox = page.locator('.bzn-lightbox:not([hidden])');
        await lightbox.waitFor();
        assert.equal(await lightbox.getAttribute('data-lightbox-content-type'), 'masks', `cycle ${cycle}: white mask Lightbox mode`);
        assert.deepEqual(runtimeErrors, [], `cycle ${cycle}: runtime errors`);
        await context.close();
        console.log(`Browser cycle ${cycle}/${CLEAN_CYCLES} passed.`);
    }
} finally {
    await browser.close();
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
}

console.log(`Masks browser passed: ${EXPECTED_COUNT} masks, pages ${EXPECTED_PAGE_COUNTS.join('/')}, Lightbox, ${CLEAN_CYCLES} clean cycles.`);
