// Browser: original SVG pixels and real gallery selections prove white-tail polarity and curved boundaries.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { workspace, settle } from '../../design-bzn-ru/NewUI/tests/Canvas_Control_Browser_Harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SETTINGS = JSON.parse(readFileSync(join(ROOT, 'config/gradient-masks.json'), 'utf8'));
const MANIFEST = JSON.parse(readFileSync(join(ROOT, SETTINGS.outputDirectory, SETTINGS.manifestName), 'utf8'));
const CONFIG = Object.freeze({ cycles: 3, zero: 0, one: 1, two: 2, half: .5, edge: .3, start: .05, end: .9,
    whiteStart: .8, stride: 16, sweep: 1024, opaque: 255, rgbaStride: 4, alphaIndex: 3, boundaryThreshold: 250, curvedDifference: .015,
    straightTolerance: .005, importTolerance: 8, side: 128, id: 'gradient-mask-layer', asset: 'gradient-mask-source',
    sourceColor: '#18b86e', host: 'https://masks.bsns.ru', ready: '#maskPainterReadyMasksButton',
    modal: '#maskPainterModal', gallery: '#bznResourceLibraryModal', cards: '#bznResourceLibraryGrid .bzn-resource-library-item',
    output: mkdtempSync(join(tmpdir(), 'bzn-mask-gradients-')), types: { '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' } });

// Class: native gallery and Use clicks are the only application path; the private local route serves actual source files.
class GradientChecks {
    constructor(page) { this.page = page; }
    async fixture() {
        await this.page.evaluate(config => {
            const source = document.createElement('canvas'); source.width = config.side; source.height = config.side;
            const context = source.getContext('2d'); context.fillStyle = config.sourceColor;
            context.fillRect(config.zero, config.zero, config.side, config.side);
            const layer = BZNNewCanvasLayerFactory.createImage({ id: config.id, name: 'Gradient masks' });
            Object.assign(layer, { width: config.side, height: config.side });
            Object.assign(layer.image, { assetId: config.asset, naturalWidth: config.side, naturalHeight: config.side });
            const project = BZNNewCanvasChrome.project(); project.state.layers = [layer]; project.state.selectedLayerId = layer.id;
            project.assets = [{ id: config.asset, name: 'source.png', dataUrl: source.toDataURL('image/png') }];
            project.background.assetId = null; project.background.dataUrl = '';
            BZNNewCanvasChrome.setProject(project, { reason: 'gradient-mask-fixture' }); BZNEditorUiV2.layersPanelController.close();
        }, CONFIG);
        await this.page.evaluate(() => BZNNewCanvasChrome.openMaskEditor('image'));
        await this.page.locator(CONFIG.modal).waitFor({ state: 'visible' });
        await this.page.locator('#maskPainterLoadModeReplace').check();
    }
    async openGallery() {
        await this.page.locator(CONFIG.ready).click(); await this.page.locator(CONFIG.cards).first().waitFor({ state: 'visible' });
        const names = MANIFEST.records.map(record => record.name);
        const cards = await this.page.locator(CONFIG.cards).evaluateAll(nodes => nodes.map(node => [node.textContent, node.getAttribute('title'), node.querySelector('img')?.alt].join(' ')));
        for (let index = CONFIG.zero; index < names.length; index += CONFIG.one) {
            // Loop: every new mask occupies its expected first-page position, rather than only being present somewhere.
            assert.ok(cards[index]?.includes(names[index]), `first mask ${index}: ${cards[index]} expected ${names[index]}`);
        }
    }
    // Function: browser rasterization checks the literal white tail, direction and inward/outward curvature independently of SVG path generation.
    async sourcePixels(record) {
        const bytes = readFileSync(join(ROOT, SETTINGS.outputDirectory, record.name));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
        const direction = SETTINGS.directions.find(direction => direction.key === record.direction);
        return this.page.evaluate(async ({ dataUrl, direction, config }) => {
            const image = new Image(); image.src = dataUrl; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const context = canvas.getContext('2d'); context.drawImage(image, config.zero, config.zero);
            const pixels = context.getImageData(config.zero, config.zero, canvas.width, canvas.height).data;
            const extent = Math.abs(direction.x) + Math.abs(direction.y), squared = direction.x * direction.x + direction.y * direction.y;
            const coordinate = (u, v) => {
                const along = extent / squared * (u - config.half), across = extent / squared * (v - config.half);
                return [(config.half + along * direction.x - across * direction.y) * canvas.width,
                    (config.half + along * direction.y + across * direction.x) * canvas.height];
            };
            const alpha = (u, v) => {
                const [x, y] = coordinate(u, v);
                if (x < config.zero || y < config.zero || x >= canvas.width || y >= canvas.height) return null;
                return context.getImageData(Math.floor(x), Math.floor(y), config.one, config.one).data[config.zero];
            };
            let tailCount = config.zero, tailFailures = config.zero, partial = config.zero, opaqueFailures = config.zero;
            for (let y = config.zero; y < canvas.height; y += config.stride) {
                // Loop: sample the entire valid white region, including transverse positions and both diagonals.
                for (let x = config.zero; x < canvas.width; x += config.stride) {
                    const progress = config.half + (direction.x * (x + config.half - canvas.width * config.half)
                        + direction.y * (y + config.half - canvas.height * config.half)) / (extent * canvas.width);
                    const offset = (y * canvas.width + x) * config.rgbaStride, value = pixels[offset];
                    if (pixels[offset + config.alphaIndex] !== config.opaque) opaqueFailures += config.one;
                    if (value > config.zero && value < config.opaque) partial += config.one;
                    if (progress >= config.whiteStart) { tailCount += config.one; if (value !== config.opaque) tailFailures += config.one; }
                }
            }
            const boundary = v => {
                for (let index = config.zero; index <= config.sweep; index += config.one) {
                    // Loop: locate the observed opaque boundary along an actual raster line.
                    const u = index / config.sweep, value = alpha(u, v);
                    if (value !== null && value >= config.boundaryThreshold) return u;
                }
                return null;
            };
            return { tailCount, tailFailures, partial, opaqueFailures, start: alpha(config.start, config.half), end: alpha(config.end, config.half),
                middle: alpha(config.half, config.half), centerBoundary: boundary(config.half), edgeBoundary: boundary(config.edge) };
        }, { dataUrl: `data:image/svg+xml;base64,${bytes.toString('base64')}`, direction, config: CONFIG });
    }
    async choose(index, record, source) {
        const prior = await this.page.evaluate(id => BZNNewCanvasChrome.project().state.layers.find(layer => layer.id === id).image.mask.assetId, CONFIG.id);
        await this.page.locator(CONFIG.cards).nth(index).click();
        await this.page.locator('#bznLightboxFooter').getByRole('button', { name: 'Использовать', exact: true }).click();
        await this.page.waitForFunction(({ id, prior, ready }) => {
            const mask = BZNNewCanvasChrome.project().state.layers.find(layer => layer.id === id).image.mask;
            return mask.assetId && mask.assetId !== prior && !document.querySelector(ready).disabled;
        }, { id: CONFIG.id, prior, ready: CONFIG.ready });
        const direction = SETTINGS.directions.find(direction => direction.key === record.direction);
        const samples = await this.page.evaluate(async ({ id, direction, config }) => {
            const project = BZNNewCanvasChrome.project(), layer = project.state.layers.find(layer => layer.id === id);
            const asset = project.assets.find(asset => asset.id === layer.image.mask.assetId), image = new Image(); image.src = asset.dataUrl; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const context = canvas.getContext('2d'); context.drawImage(image, config.zero, config.zero);
            const scale = (Math.abs(direction.x) + Math.abs(direction.y)) / (direction.x * direction.x + direction.y * direction.y);
            return [config.start, config.half, config.end].map(u => {
                const x = (config.half + scale * (u - config.half) * direction.x) * canvas.width;
                const y = (config.half + scale * (u - config.half) * direction.y) * canvas.height;
                return [...context.getImageData(Math.floor(x), Math.floor(y), config.one, config.one).data];
            });
        }, { id: CONFIG.id, direction, config: CONFIG });
        assert.equal(samples[CONFIG.two][CONFIG.zero], CONFIG.opaque, 'white end remains white after real import');
        for (const sample of samples) {
            // Loop: the existing importer stores RGB luminance with full alpha; no colored or inverted mask leaks through.
            assert.equal(sample[CONFIG.zero], sample[CONFIG.one]); assert.equal(sample[CONFIG.one], sample[CONFIG.two]);
            assert.equal(sample[CONFIG.two + CONFIG.one], CONFIG.opaque);
        }
        const expected = [source.start, source.middle, source.end];
        samples.forEach((sample, index) => assert.ok(Math.abs(sample[CONFIG.zero] - expected[index]) <= CONFIG.importTolerance, `import ${record.name}: ${sample} expected ${expected[index]}`));
        await this.page.locator('#maskPainterAppliedViewButton').click(); await settle(this.page);
        return samples;
    }
}

const session = await workspace(), checks = new GradientChecks(session.page), reports = [];
try {
    if (!process.env.BZN_PUBLISHED) {
        // Branch: local verification serves actual resources from this checkout; published verification uses live GET reads.
        await session.page.route(`${CONFIG.host}/**`, async route => {
            const url = new URL(route.request().url()), file = resolve(ROOT, decodeURIComponent(url.pathname).slice(CONFIG.one));
            const type = Object.entries(CONFIG.types).find(([extension]) => file.endsWith(extension))?.[CONFIG.one];
            if (!file.startsWith(resolve(ROOT, SETTINGS.outputDirectory) + sep) || !existsSync(file) || !type) return route.abort();
            await route.fulfill({ contentType: type, body: readFileSync(file) });
        });
    }
    await session.page.evaluate(() => document.fonts.ready);
    for (let cycle = CONFIG.zero; cycle < CONFIG.cycles; cycle += CONFIG.one) {
        // Loop: the entire eighteen-mask first-page selection repeats with fresh layer ownership.
        await checks.fixture();
        for (let index = CONFIG.zero; index < MANIFEST.records.length; index += CONFIG.one) {
            const record = MANIFEST.records[index], source = await checks.sourcePixels(record);
            assert.ok(source.tailCount > CONFIG.zero); assert.equal(source.tailFailures, CONFIG.zero); assert.ok(source.partial > CONFIG.zero);
            assert.equal(source.opaqueFailures, CONFIG.zero, 'grayscale thumbnail is visible on the white gallery underlay');
            assert.equal(source.end, CONFIG.opaque); assert.ok(source.start < source.middle);
            const delta = source.centerBoundary - source.edgeBoundary;
            if (record.curve === 'linear') assert.ok(Math.abs(delta) <= CONFIG.straightTolerance);
            if (record.curve === 'concave') assert.ok(delta > CONFIG.curvedDifference, `concave ${record.name}: ${JSON.stringify(source)}`);
            if (record.curve === 'convex') assert.ok(delta < -CONFIG.curvedDifference, `convex ${record.name}: ${JSON.stringify(source)}`);
            await checks.openGallery();
            if (index === CONFIG.zero) await session.page.locator(CONFIG.gallery).screenshot({ path: join(CONFIG.output, `gallery-${cycle}.png`) });
            const imported = await checks.choose(index, record, source); reports.push({ cycle: cycle + CONFIG.one, name: record.name, source, imported });
        }
        await session.page.locator(CONFIG.modal).screenshot({ path: join(CONFIG.output, `mask-${cycle}.png`) });
        await session.page.locator('#maskPainterCloseButton').click(); assert.deepEqual(session.errors, []);
        console.log(`PASS gradient masks ${cycle + CONFIG.one}: 18 first-page native choices, curved boundaries, opaque white tail and stored grayscale`);
    }
    writeFileSync(join(CONFIG.output, 'report.json'), JSON.stringify({ reports, errors: session.errors }, null, CONFIG.two));
    console.log(`Gradient evidence ${CONFIG.output}`);
} catch (error) {
    await session.page.screenshot({ path: join(CONFIG.output, 'failure.png') }); console.error(`Gradient evidence ${CONFIG.output}`); throw error;
} finally { await session.close(); }
