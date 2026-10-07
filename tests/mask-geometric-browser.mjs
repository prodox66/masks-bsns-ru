// Browser: native gallery choices preserve detached vector fragments and their mirrored counterparts.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { workspace, settle } from '../../design-bzn-ru/NewUI/tests/Canvas_Control_Browser_Harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SETTINGS = JSON.parse(readFileSync(join(ROOT, 'config/geometric-masks.json'), 'utf8'));
const MANIFEST = JSON.parse(readFileSync(join(ROOT, SETTINGS.outputDirectory, SETTINGS.manifestName), 'utf8'));
const GRADIENTS = JSON.parse(readFileSync(join(ROOT, SETTINGS.outputDirectory, SETTINGS.gradientManifestName), 'utf8'));
const CONFIG = Object.freeze({ cycles: 3, zero: 0, one: 1, two: 2, width: 256, height: 160, rgbaStride: 4, alphaIndex: 3,
    opaque: 255, grayTolerance: 8, samplingStride: 7, componentThreshold: 128, minimumComponents: 3, gridWidth: 64, gridHeight: 40,
    corner: .02, center: .5, timeout: 20000, id: 'geometric-mask-layer', asset: 'geometric-mask-source',
    sourceStart: '#b6df42', sourceEnd: '#349d98', background: '#741fce', host: 'https://masks.bsns.ru',
    ready: '#maskPainterReadyMasksButton', modal: '#maskPainterModal', gallery: '#bznResourceLibraryModal',
    cards: '#bznResourceLibraryGrid .bzn-resource-library-item', output: mkdtempSync(join(tmpdir(), 'bzn-mask-geometric-')),
    types: { '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' } });

// Class: only source fixture setup is synthetic; all mask choice, import, visual view and reopening use actual UI paths.
class GeometricChecks {
    constructor(page) { this.page = page; }
    async fixture() {
        await this.page.evaluate(config => {
            const source = document.createElement('canvas'); source.width = config.width; source.height = config.height;
            const context = source.getContext('2d'), gradient = context.createLinearGradient(config.zero, config.zero, config.width, config.height);
            gradient.addColorStop(config.zero, config.sourceStart); gradient.addColorStop(config.one, config.sourceEnd);
            context.fillStyle = gradient; context.fillRect(config.zero, config.zero, config.width, config.height);
            const layer = BZNNewCanvasLayerFactory.createImage({ id: config.id, name: 'Косые фрагменты' });
            Object.assign(layer, { width: config.width, height: config.height });
            Object.assign(layer.image, { assetId: config.asset, naturalWidth: config.width, naturalHeight: config.height });
            const project = BZNNewCanvasChrome.project(); project.state.layers = [layer]; project.state.selectedLayerId = layer.id;
            project.assets = [{ id: config.asset, name: 'source.png', dataUrl: source.toDataURL('image/png') }];
            project.background.assetId = null; project.background.dataUrl = '';
            BZNNewCanvasChrome.setProject(project, { reason: 'geometric-mask-fixture' }); BZNEditorUiV2.layersPanelController.close();
        }, CONFIG);
        await this.openPainter();
    }
    async openPainter() {
        await this.page.evaluate(() => BZNNewCanvasChrome.openMaskEditor('image'));
        await this.page.locator(CONFIG.modal).waitFor({ state: 'visible' }); await this.page.locator('#maskPainterLoadModeReplace').check();
    }
    async openGallery() {
        await this.page.locator(CONFIG.ready).click(); await this.page.locator(CONFIG.cards).first().waitFor({ state: 'visible' });
        const names = [...GRADIENTS.records, ...MANIFEST.records].map(record => record.name);
        const cards = await this.page.locator(CONFIG.cards).evaluateAll(nodes => nodes.map(node => [node.textContent, node.getAttribute('title'), node.querySelector('img')?.alt].join(' ')));
        names.forEach((name, index) => assert.ok(cards[index]?.includes(name), `order ${index}: ${name} ${cards[index]}`));
    }
    // Function: inspect rasterized sources independently of polygon generation and count actual separated white components.
    async source(record) {
        const bytes = readFileSync(join(ROOT, SETTINGS.outputDirectory, record.name));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
        return this.page.evaluate(async ({ dataUrl, config }) => {
            const image = new Image(); image.src = dataUrl; await image.decode();
            // SVG decoding precedes bitmap resizing during import; direct small SVG drawing rasterizes different boundary pixels.
            const original = document.createElement('canvas'); original.width = image.width; original.height = image.height;
            original.getContext('2d').drawImage(image, config.zero, config.zero);
            const bitmap = await createImageBitmap(original);
            const canvas = document.createElement('canvas'); canvas.width = config.width; canvas.height = config.height;
            const context = canvas.getContext('2d'); context.drawImage(bitmap, config.zero, config.zero, config.width, config.height);
            const pixels = context.getImageData(config.zero, config.zero, config.width, config.height).data;
            const sample = (x, y) => pixels[(Math.floor(y * config.height) * config.width + Math.floor(x * config.width)) * config.rgbaStride];
            const grid = document.createElement('canvas'); grid.width = config.gridWidth; grid.height = config.gridHeight;
            const gridContext = grid.getContext('2d'); gridContext.drawImage(bitmap, config.zero, config.zero, grid.width, grid.height);
            bitmap.close();
            const gridPixels = gridContext.getImageData(config.zero, config.zero, grid.width, grid.height).data;
            const seen = new Uint8Array(grid.width * grid.height); let components = config.zero;
            for (let index = config.zero; index < seen.length; index += config.one) {
                // Loop: flood-fill each white island once; disconnected diagonal strips are measurable rather than inferred from markup.
                if (seen[index] || gridPixels[index * config.rgbaStride] < config.componentThreshold) continue;
                components += config.one; const queue = [index]; seen[index] = config.one;
                while (queue.length) {
                    const current = queue.pop(), x = current % grid.width, y = Math.floor(current / grid.width);
                    const neighbors = [];
                    if (x > config.zero) neighbors.push(current - config.one);
                    if (x + config.one < grid.width) neighbors.push(current + config.one);
                    if (y > config.zero) neighbors.push(current - grid.width);
                    if (y + config.one < grid.height) neighbors.push(current + grid.width);
                    for (const next of neighbors) if (!seen[next] && gridPixels[next * config.rgbaStride] >= config.componentThreshold) {
                        seen[next] = config.one; queue.push(next);
                    }
                }
            }
            return { pixels: [...pixels], components, center: sample(config.center, config.center), corner: sample(config.corner, config.corner) };
        }, { dataUrl: `data:image/svg+xml;base64,${bytes.toString('base64')}`, config: CONFIG });
    }
    async stored() {
        return this.page.evaluate(async config => {
            const project = BZNNewCanvasChrome.project(), layer = project.state.layers.find(layer => layer.id === config.id);
            const asset = project.assets.find(asset => asset.id === layer.image.mask.assetId), image = new Image(); image.src = asset.dataUrl; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const context = canvas.getContext('2d'); context.drawImage(image, config.zero, config.zero);
            return { width: image.width, height: image.height, assetId: asset.id,
                pixels: [...context.getImageData(config.zero, config.zero, image.width, image.height).data] };
        }, CONFIG);
    }
    async choose(index, expected) {
        const prior = await this.page.evaluate(id => BZNNewCanvasChrome.project().state.layers.find(layer => layer.id === id).image.mask.assetId, CONFIG.id);
        await this.page.locator(CONFIG.cards).nth(GRADIENTS.records.length + index).click();
        await this.page.locator('#bznLightboxFooter').getByRole('button', { name: 'Использовать', exact: true }).click();
        await this.page.waitForFunction(({ id, prior, ready }) => {
            const mask = BZNNewCanvasChrome.project().state.layers.find(layer => layer.id === id).image.mask;
            return mask.assetId && mask.assetId !== prior && !document.querySelector(ready).disabled;
        }, { id: CONFIG.id, prior, ready: CONFIG.ready }, { timeout: CONFIG.timeout });
        const stored = await this.stored(); assert.equal(stored.width, CONFIG.width); assert.equal(stored.height, CONFIG.height);
        let checkedWhite = CONFIG.zero, checkedBlack = CONFIG.zero;
        for (let pixel = CONFIG.zero; pixel < CONFIG.width * CONFIG.height; pixel += CONFIG.samplingStride) {
            // Loop: interior samples prove fragments and gaps; SVG/PNG resize antialiasing can differ only at their boundary.
            const offset = pixel * CONFIG.rgbaStride, value = stored.pixels[offset];
            const expectedValue = expected.pixels[offset];
            if (this.isInterior(expected.pixels, pixel)) {
                assert.ok(Math.abs(value - expectedValue) <= CONFIG.grayTolerance, `stored fragment pixel ${pixel}: ${value} expected ${expectedValue}`);
                if (expectedValue === CONFIG.opaque) checkedWhite += CONFIG.one;
                if (expectedValue === CONFIG.zero) checkedBlack += CONFIG.one;
            }
            assert.equal(value, stored.pixels[offset + CONFIG.one]); assert.equal(value, stored.pixels[offset + CONFIG.two]);
            assert.equal(stored.pixels[offset + CONFIG.alphaIndex], CONFIG.opaque);
        }
        assert.ok(checkedWhite > CONFIG.zero && checkedBlack > CONFIG.zero, 'both reveal and hidden interiors tested');
        await this.page.locator('#maskPainterAppliedViewButton').click(); await settle(this.page);
        await this.page.locator('#maskPainterCloseButton').click(); await this.openPainter();
        assert.equal((await this.stored()).assetId, stored.assetId, 'gallery choice survives editor reopening');
        await this.page.locator('#maskPainterAppliedViewButton').click(); await settle(this.page);
        return stored.assetId;
    }
    // Function: fully flat neighboring pixels avoid comparing browser-specific boundary resampling noise.
    isInterior(pixels, pixel) {
        const x = pixel % CONFIG.width, y = Math.floor(pixel / CONFIG.width), value = pixels[pixel * CONFIG.rgbaStride];
        if (value !== CONFIG.zero && value !== CONFIG.opaque) return false;
        if (x <= CONFIG.one || x >= CONFIG.width - CONFIG.two || y <= CONFIG.one || y >= CONFIG.height - CONFIG.two) return false;
        for (let row = y - CONFIG.one; row <= y + CONFIG.one; row += CONFIG.one) {
            for (let column = x - CONFIG.one; column <= x + CONFIG.one; column += CONFIG.one) {
                if (pixels[(row * CONFIG.width + column) * CONFIG.rgbaStride] !== value) return false;
            }
        }
        return true;
    }
}

const session = await workspace(), checks = new GeometricChecks(session.page), reports = [];
try {
    if (!process.env.BZN_PUBLISHED) {
        // Branch: local resource GETs serve only actual checkout mask files; published runs fetch live assets.
        await session.page.route(`${CONFIG.host}/**`, async route => {
            const url = new URL(route.request().url()), file = resolve(ROOT, decodeURIComponent(url.pathname).slice(CONFIG.one));
            const type = Object.entries(CONFIG.types).find(([extension]) => file.endsWith(extension))?.[CONFIG.one];
            if (!file.startsWith(resolve(ROOT, SETTINGS.outputDirectory) + sep) || !existsSync(file) || !type) return route.abort();
            await route.fulfill({ contentType: type, body: readFileSync(file) });
        });
    }
    for (let cycle = CONFIG.zero; cycle < CONFIG.cycles; cycle += CONFIG.one) {
        // Loop: fresh layer state repeats all six styles, their real Use actions and editor reopening.
        await checks.fixture(); let previous;
        for (let index = CONFIG.zero; index < MANIFEST.records.length; index += CONFIG.one) {
            const record = MANIFEST.records[index], source = await checks.source(record);
            assert.equal(source.center, CONFIG.opaque); assert.equal(source.corner, CONFIG.zero); assert.ok(source.components >= CONFIG.minimumComponents);
            if (record.orientation === 'left') {
                // Branch: the second actual raster is the horizontal mirror, not a duplicate thumbnail with another name.
                for (let y = CONFIG.zero; y < CONFIG.height; y += CONFIG.samplingStride) for (let x = CONFIG.zero; x < CONFIG.width; x += CONFIG.samplingStride) {
                    const offset = (y * CONFIG.width + x) * CONFIG.rgbaStride;
                    const mirrored = (y * CONFIG.width + CONFIG.width - CONFIG.one - x) * CONFIG.rgbaStride;
                    if (checks.isInterior(source.pixels, y * CONFIG.width + x)) {
                        assert.ok(Math.abs(source.pixels[offset] - previous.pixels[mirrored]) <= CONFIG.grayTolerance, 'mirrored silhouette');
                    }
                }
            }
            previous = source; await checks.openGallery();
            if (index === CONFIG.zero) await session.page.locator(CONFIG.gallery).screenshot({ path: join(CONFIG.output, `gallery-${cycle}.png`) });
            const assetId = await checks.choose(index, source);
            await session.page.locator(CONFIG.modal).screenshot({ path: join(CONFIG.output, `mask-${cycle}-${index}.png`) });
            reports.push({ cycle: cycle + CONFIG.one, name: record.name, components: source.components, assetId });
        }
        await session.page.locator('#maskPainterCloseButton').click(); assert.deepEqual(session.errors, []);
        console.log(`PASS geometric masks ${cycle + CONFIG.one}: six native choices, detached pieces, mirrored pixels, saved grayscale and reopen; gradients remain first`);
    }
    writeFileSync(join(CONFIG.output, 'report.json'), JSON.stringify({ reports, errors: session.errors }, null, CONFIG.two)); console.log(`Geometry evidence ${CONFIG.output}`);
} catch (error) {
    await session.page.screenshot({ path: join(CONFIG.output, 'failure.png') }); console.error(`Geometry evidence ${CONFIG.output}`); throw error;
} finally { await session.close(); }
