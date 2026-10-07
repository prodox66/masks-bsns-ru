// Native source rasterization and real gallery Use/save/reopen, in three clean owned-browser cycles.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { workspace, settle } from '../../design-bzn-ru/NewUI/tests/Canvas_Control_Browser_Harness.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SETTINGS = JSON.parse(readFileSync(join(ROOT, 'config/corner-gradient-masks.json'), 'utf8'));
const MANIFEST = JSON.parse(readFileSync(join(ROOT, SETTINGS.outputDirectory, SETTINGS.manifestName), 'utf8'));
const GRADIENTS = JSON.parse(readFileSync(join(ROOT, SETTINGS.outputDirectory, SETTINGS.orderingManifestName), 'utf8'));
const CONFIG = Object.freeze({ cycles: 3, zero: 0, one: 1, two: 2, half: .5, stride: 8, side: 128, whiteProbe: .1, blackProbe: .9, grayProbe: .35,
    whiteEnd: .24, blackStart: .75, opaque: 255, rgbaStride: 4, alphaIndex: 3, tolerance: 8,
    id: 'corner-mask-layer', asset: 'corner-mask-source', sourceColor: '#94785a', host: 'https://masks.bsns.ru',
    ready: '#maskPainterReadyMasksButton', modal: '#maskPainterModal', gallery: '#bznResourceLibraryModal',
    cards: '#bznResourceLibraryGrid .bzn-resource-library-item', output: mkdtempSync(join(tmpdir(), 'bzn-mask-corners-')),
    types: { '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' } });

/** Fixture owns no user project or external writes; application uses normal controls and importer. */
class CornerChecks {
    constructor(page) { this.page = page; }
    async fixture() {
        await this.page.evaluate(config => {
            const source = document.createElement('canvas'); source.width = config.side; source.height = config.side;
            const context = source.getContext('2d'); context.fillStyle = config.sourceColor; context.fillRect(config.zero, config.zero, config.side, config.side);
            const layer = BZNNewCanvasLayerFactory.createImage({ id: config.id, name: 'Угловой градиент', width: config.side, height: config.side });
            Object.assign(layer.image, { assetId: config.asset, naturalWidth: config.side, naturalHeight: config.side });
            const project = BZNNewCanvasChrome.project(); project.state.layers = [layer]; project.state.selectedLayerId = layer.id;
            project.assets = [{ id: config.asset, name: 'source.png', dataUrl: source.toDataURL('image/png') }];
            project.background.assetId = null; project.background.dataUrl = '';
            BZNNewCanvasChrome.setProject(project); BZNEditorUiV2.layersPanelController.close();
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
        const cards = await this.page.locator(CONFIG.cards).evaluateAll(nodes => nodes.map(node => node.querySelector('img')?.alt || node.textContent));
        names.forEach((name, index) => assert.ok(cards[index]?.includes(name), `first page${index}: ${name}`));
    }
    /** Actual SVG raster bytes, independent of contour arithmetic, must have exact RGB plateaus and no transparency. */
    async pixels(record, dataUrl) {
        const direction = SETTINGS.directions.find(direction => direction.key === record.direction);
        return this.page.evaluate(async ({ dataUrl, direction, config }) => {
            const image = new Image(); image.src = dataUrl; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const context = canvas.getContext('2d'); context.drawImage(image, config.zero, config.zero);
            const pixels = context.getImageData(config.zero, config.zero, canvas.width, canvas.height).data;
            const sample = (u, v) => {
                const x = Math.floor((direction.x > config.zero ? u : config.one - u) * canvas.width);
                const y = Math.floor((direction.y > config.zero ? v : config.one - v) * canvas.height);
                return [...context.getImageData(x, y, config.one, config.one).data];
            };
            let black = config.zero, white = config.zero, partial = config.zero, failures = config.zero;
            for (let y = config.zero; y < canvas.height; y += config.stride) {
                // Loop: the whole opposite bands are black, not just a single edge pixel.
                for (let x = config.zero; x < canvas.width; x += config.stride) {
                    const offset = (y * canvas.width + x) * config.rgbaStride, value = pixels[offset];
                    const u = direction.x > config.zero ? (x + config.half) / canvas.width : config.one - (x + config.half) / canvas.width;
                    const v = direction.y > config.zero ? (y + config.half) / canvas.height : config.one - (y + config.half) / canvas.height;
                    if (pixels[offset + config.one] !== value || pixels[offset + config.two] !== value || pixels[offset + config.alphaIndex] !== config.opaque) failures += config.one;
                    if (u >= config.blackStart || v >= config.blackStart) { black += config.one; if (value !== config.zero) failures += config.one; }
                    if (u <= config.whiteEnd && v <= config.whiteEnd) { white += config.one; if (value !== config.opaque) failures += config.one; }
                    if (value > config.zero && value < config.opaque) partial += config.one;
                }
            }
            return { black, white, partial, failures, whiteCorner: sample(config.whiteProbe, config.whiteProbe),
                right: sample(config.blackProbe, config.half), bottom: sample(config.half, config.blackProbe),
                gray: sample(config.grayProbe, config.grayProbe) };
        }, { dataUrl, direction, config: CONFIG });
    }
    async source(record) {
        const bytes = readFileSync(join(ROOT, SETTINGS.outputDirectory, record.name));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
        return this.pixels(record, `data:image/svg+xml;base64,${bytes.toString('base64')}`);
    }
    async stored(record) {
        const asset = await this.page.evaluate(id => {
            const project = BZNNewCanvasChrome.project(), layer = project.state.layers.find(layer => layer.id === id);
            return project.assets.find(asset => asset.id === layer.image.mask.assetId);
        }, CONFIG.id);
        return { id: asset.id, ...(await this.pixels(record, asset.dataUrl)) };
    }
    async choose(index, record, source) {
        const prior = await this.page.evaluate(id => BZNNewCanvasChrome.project().state.layers.find(layer => layer.id === id).image.mask.assetId, CONFIG.id);
        await this.page.locator(CONFIG.cards).nth(GRADIENTS.records.length + index).click();
        await this.page.locator('#bznLightboxFooter').getByRole('button', { name: 'Использовать', exact: true }).click();
        await this.page.waitForFunction(({ id, prior, ready }) => {
            const mask = BZNNewCanvasChrome.project().state.layers.find(layer => layer.id === id).image.mask;
            return mask.assetId && mask.assetId !== prior && !document.querySelector(ready).disabled;
        }, { id: CONFIG.id, prior, ready: CONFIG.ready });
        const stored = await this.stored(record); assert.equal(stored.failures, CONFIG.zero);
        assert.deepEqual(stored.whiteCorner, [CONFIG.opaque, CONFIG.opaque, CONFIG.opaque, CONFIG.opaque]);
        assert.deepEqual(stored.right, [CONFIG.zero, CONFIG.zero, CONFIG.zero, CONFIG.opaque]); assert.deepEqual(stored.bottom, stored.right);
        assert.ok(Math.abs(stored.gray[CONFIG.zero] - source.gray[CONFIG.zero]) <= CONFIG.tolerance);
        await this.page.locator('#maskPainterAppliedViewButton').click(); await settle(this.page);
        await this.page.locator('#maskPainterSaveButton').click(); await this.page.locator(CONFIG.modal).waitFor({ state: 'hidden' });
        const saved = await this.stored(record);
        await this.openPainter(); assert.equal((await this.stored(record)).id, saved.id, 'Save/apply and reopen preserve saved mask');
        assert.equal(saved.failures, CONFIG.zero); assert.deepEqual(saved.whiteCorner, stored.whiteCorner);
        assert.deepEqual(saved.right, stored.right); assert.deepEqual(saved.bottom, stored.bottom);
        await this.page.locator('#maskPainterAppliedViewButton').click(); await settle(this.page);
        return stored;
    }
}

const session = await workspace(), checks = new CornerChecks(session.page), reports = [];
try {
    if (!process.env.BZN_PUBLISHED) await session.page.route(`${CONFIG.host}/**`, async route => {
        const url = new URL(route.request().url()), file = resolve(ROOT, decodeURIComponent(url.pathname).slice(CONFIG.one));
        const type = Object.entries(CONFIG.types).find(([extension]) => file.endsWith(extension))?.[CONFIG.one];
        if (!file.startsWith(resolve(ROOT, SETTINGS.outputDirectory) + sep) || !existsSync(file) || !type) return route.abort();
        await route.fulfill({ contentType: type, body: readFileSync(file) });
    });
    for (let cycle = CONFIG.zero; cycle < CONFIG.cycles; cycle += CONFIG.one) {
        await checks.fixture(); const gray = new Map();
        for (let index = CONFIG.zero; index < MANIFEST.records.length; index += CONFIG.one) {
            // Loop: all twelve variants repeat with native gallery Use, save and editor reopening.
            const record = MANIFEST.records[index], source = await checks.source(record);
            assert.equal(source.failures, CONFIG.zero); assert.ok(source.black && source.white && source.partial);
            gray.set(record.curve, source.gray[CONFIG.zero]);
            if (record.curve === 'convex') assert.ok(gray.get('concave') < gray.get('linear') && gray.get('linear') < gray.get('convex'), 'actual curves bend in different directions');
            await checks.openGallery(); if (index === CONFIG.zero) await session.page.locator(CONFIG.gallery).screenshot({ path: join(CONFIG.output, `gallery-${cycle}.png`) });
            const stored = await checks.choose(index, record, source); reports.push({ cycle, name: record.name, source, stored });
            if (index === CONFIG.zero) await session.page.locator(CONFIG.modal).screenshot({ path: join(CONFIG.output, `applied-${cycle}.png`) });
        }
        await session.page.locator('#maskPainterCloseButton').click(); assert.deepEqual(session.errors, []);
        console.log(`PASS corners${cycle + CONFIG.one}:12 native choices/save/reopen, mirrored black25% opposite bands, white25% corner,3 curves; old18 first`);
    }
    writeFileSync(join(CONFIG.output, 'report.json'), JSON.stringify({ reports, errors: session.errors }, null, CONFIG.two));
    console.log(`Corner evidence ${CONFIG.output}`);
} catch (error) { await session.page.screenshot({ path: join(CONFIG.output, 'failure.png') }); console.error(CONFIG.output); throw error; }
finally { await session.close(); }
