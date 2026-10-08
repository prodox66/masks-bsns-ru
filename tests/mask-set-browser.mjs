// Shared native acceptance probe for separately generated static sets; no editor repair methods are invoked.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { workspace, settle } from '../../design-bzn-ru/NewUI/tests/Canvas_Control_Browser_Harness.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CONFIG = Object.freeze({ settings: process.env.BZN_MASK_SET || 'fitted-masks', cycles: 3, zero: 0, one: 1, two: 2, half: .5,
    side: 320, aspects: [1, 2.5, .4], alpha: 255, stride: 4, low: 16, high: 240, edgeTolerance: .018, centerTolerance: 24,
    quarterTurn: 90, halfTurn: 180, threeQuarterTurn: 270, minimumRibbonRuns: 3, minimumWhiteCoverage: .75,
    host: 'https://masks.bsns.ru', id: 'mask-set-layer', asset: 'mask-set-source', color: '#94785a',
    cards: '#bznResourceLibraryGrid .bzn-resource-library-item', modal: '#maskPainterModal', gallery: '#bznResourceLibraryModal',
    next: '#bznResourceLibraryNext', ready: '#maskPainterReadyMasksButton', save: '#maskPainterSaveButton',
    types: { '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' },
    output: mkdtempSync(join(tmpdir(), 'bzn-mask-set-')) });
const SETTINGS = JSON.parse(readFileSync(join(ROOT, `config/${CONFIG.settings}.json`), 'utf8'));
const MANIFEST = JSON.parse(readFileSync(join(ROOT, SETTINGS.outputDirectory, SETTINGS.manifestName), 'utf8'));
const SELECTED_KEYS = process.env.BZN_MASK_KEYS?.split(',');
const RECORDS = SELECTED_KEYS ? MANIFEST.records.filter(record => SELECTED_KEYS.includes(record.key)) : MANIFEST.records;
assert.ok(RECORDS.length, 'The declared mask selection exists');

class MaskSetChecks {
    constructor(page) { this.page = page; }
    /** Each clean cycle owns a different aspect ratio; all clicks use existing native controls. */
    async fixture(cycle) {
        await this.page.evaluate(config => {
            const width = Math.round(config.side * config.aspect), canvas = document.createElement('canvas'); canvas.width = width; canvas.height = config.side;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = config.color; ctx.fillRect(config.zero, config.zero, width, config.side);
            const layer = BZNNewCanvasLayerFactory.createImage({ id: config.id, name: 'Готовая маска', width, height: config.side });
            Object.assign(layer.image, { assetId: config.asset, naturalWidth: width, naturalHeight: config.side });
            const project = BZNNewCanvasChrome.project(); project.state.layers = [layer]; project.state.selectedLayerId = layer.id;
            project.assets = [{ id: config.asset, name: 'source.png', dataUrl: canvas.toDataURL('image/png') }];
            project.background.assetId = null; project.background.dataUrl = '';
            BZNNewCanvasChrome.setProject(project); BZNEditorUiV2.layersPanelController.close();
        }, { ...CONFIG, aspect: CONFIG.aspects[cycle] });
        await this.open();
    }
    async open() {
        await this.page.evaluate(() => BZNNewCanvasChrome.openMaskEditor('image'));
        await this.page.locator(CONFIG.modal).waitFor({ state: 'visible' }); await this.page.locator('#maskPainterLoadModeReplace').check();
    }
    /** Source and imported PNG are measured independently by actual browser rasterization. */
    async pixels(dataUrl) {
        return this.page.evaluate(async ({ dataUrl, config }) => {
            const image = new Image(); image.src = dataUrl; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(image, config.zero, config.zero);
            const pixels = ctx.getImageData(config.zero, config.zero, image.width, image.height).data;
            let failures = config.zero, white = config.zero, black = config.zero, partial = config.zero;
            let left = image.width, right = config.zero, top = image.height, bottom = config.zero;
            const bands = Array.from({length: config.stride}, () => ({sum: config.zero, count: config.zero}));
            const rows = Array.from({length: config.stride}, () => ({sum: config.zero, count: config.zero}));
            for (let y = config.zero; y < image.height; y += config.one) for (let x = config.zero; x < image.width; x += config.one) {
                // Loop: RGB equality and full opacity are checked over the complete output, including the frame.
                const offset = (y * image.width + x) * config.stride, value = pixels[offset];
                if (pixels[offset + config.one] !== value || pixels[offset + config.two] !== value || pixels[offset + config.stride - config.one] !== config.alpha) failures += config.one;
                if (value >= config.high) white += config.one; else if (value <= config.low) black += config.one; else partial += config.one;
                if (value > config.low) { left = Math.min(left,x); right = Math.max(right,x); top = Math.min(top,y); bottom = Math.max(bottom,y); }
                const band = bands[Math.min(config.stride - config.one, Math.floor(x / image.width * config.stride))]; band.sum += value; band.count += config.one;
                const rowBand = rows[Math.min(config.stride - config.one, Math.floor(y / image.height * config.stride))]; rowBand.sum += value; rowBand.count += config.one;
            }
            // Independent silhouette probe counts detached white islands through the center of each axis.
            const runs = vertical => {
                let count = config.zero, prior = false;
                const extent = vertical ? image.height : image.width;
                for(let index = config.zero; index < extent; index += config.one) {
                    const x = vertical ? Math.floor(image.width * config.half) : index;
                    const y = vertical ? index : Math.floor(image.height * config.half);
                    const white = pixels[(y * image.width + x) * config.stride] >= config.high;
                    if(white && !prior) count += config.one; prior = white;
                }
                return count;
            };
            const at = (u,v) => [...ctx.getImageData(Math.min(image.width-config.one,Math.floor(u*image.width)), Math.min(image.height-config.one,Math.floor(v*image.height)),config.one,config.one).data];
            return { failures, white, black, partial, size: [image.width,image.height], bounds: [left/image.width,top/image.height,(image.width-right-config.one)/image.width,(image.height-bottom-config.one)/image.height],
                corners: [at(config.zero,config.zero),at(config.one,config.zero),at(config.zero,config.one),at(config.one,config.one)], center: at(config.half,config.half), bands: bands.map(band=>band.sum/band.count), rows: rows.map(band=>band.sum/band.count), runs: [runs(false),runs(true)] };
        }, { dataUrl, config: CONFIG });
    }
    validate(record, result) {
        assert.equal(result.failures,CONFIG.zero,`opaque grayscale: ${record.name}`); assert.ok(result.white && result.black,'Both black and white regions exist');
        if (CONFIG.settings === 'fitted-masks') {
            // Independent requirement: removed letterbox borders leave a small nonzero margin on all four sides.
            result.bounds.forEach(value => assert.ok(value >= SETTINGS.margin - CONFIG.edgeTolerance && value <= SETTINGS.margin + CONFIG.edgeTolerance, `${record.name}: margin ${value}`));
            result.corners.forEach(pixel=>assert.deepEqual(pixel,[CONFIG.zero,CONFIG.zero,CONFIG.zero,CONFIG.alpha]));
        }
        if (CONFIG.settings === 'raster-masks') {
            const variant = SETTINGS.variants.find(variant => variant.key === record.key);
            if (variant.family === 'capsules') {
                assert.ok(Math.max(...result.runs) >= CONFIG.minimumRibbonRuns,'Diagonal rounded strips remain separate');
                result.corners.forEach(pixel=>assert.deepEqual(pixel,[CONFIG.zero,CONFIG.zero,CONFIG.zero,CONFIG.alpha]));
            } else {
                // Requirement: at least three full quarters stay completely visible; only the final edge band fades.
                const vertical = variant.angle === CONFIG.quarterTurn || variant.angle === CONFIG.threeQuarterTurn;
                let bands = vertical ? [...result.rows] : [...result.bands];
                if(variant.angle === CONFIG.halfTurn || variant.angle === CONFIG.threeQuarterTurn) bands.reverse();
                bands.slice(CONFIG.zero, -CONFIG.one).forEach(value => assert.equal(value,CONFIG.alpha,'First three quarters are completely white'));
                assert.ok(bands.at(-CONFIG.one) > CONFIG.zero && bands.at(-CONFIG.one) < CONFIG.alpha,'Only the final edge band contains the fade');
                assert.ok(result.white / (result.size[CONFIG.zero] * result.size[CONFIG.one]) >= CONFIG.minimumWhiteCoverage,'Mask retains at least 75% completely visible pixels');
            }
        }
        if (CONFIG.settings === 'decorative-masks') {
            const variant = SETTINGS.variants.find(variant => variant.key === record.key);
            result.corners.forEach(pixel=>assert.deepEqual(pixel,[CONFIG.zero,CONFIG.zero,CONFIG.zero,CONFIG.alpha]));
            result.bounds.forEach(value=>assert.ok(value >= SETTINGS.margin - CONFIG.edgeTolerance && value <= SETTINGS.ornamentInset,`${record.name}: small decorative outside gap ${value}`));
            // The painted border is intentionally separate from a mask revealing the image center.
            if(variant.family === 'painted-frame') assert.equal(result.center[CONFIG.zero],CONFIG.zero,'Painted frame hides its center');
            if(variant.family === 'ornament') assert.equal(result.center[CONFIG.zero],CONFIG.alpha,'Ornamental mask keeps its center visible');
        }
    }
    async select(record) {
        await this.page.locator(CONFIG.ready).click(); await this.page.locator(CONFIG.cards).first().waitFor({state:'visible'});
        while (true) {
            // Paging uses the actual enabled Next button; source names never become hidden UI mutations.
            const names = await this.page.locator(CONFIG.cards).evaluateAll(nodes=>nodes.map(node=>node.querySelector('img')?.alt||''));
            const index = names.findIndex(name=>name.includes(record.name));
            if (index >= CONFIG.zero) { await this.page.locator(CONFIG.cards).nth(index).click(); break; }
            assert.equal(await this.page.locator(CONFIG.next).isEnabled(),true,`Gallery resource exists: ${record.name}`);
            await this.page.locator(CONFIG.next).click();
            await this.page.waitForFunction(({cards,previous})=>{const image=document.querySelector(`${cards} img`);return image?.alt&&image.alt!==previous;},{cards:CONFIG.cards,previous:names[CONFIG.zero]});
            await settle(this.page);
        }
        const prior = await this.asset();
        await this.page.locator('#bznLightboxFooter').getByRole('button',{name:'Использовать',exact:true}).click();
        await this.page.waitForFunction(({id,prior,ready})=>{const mask=BZNNewCanvasChrome.project().state.layers.find(layer=>layer.id===id).image.mask;return mask.assetId&&mask.assetId!==prior&&!document.querySelector(ready).disabled;},{id:CONFIG.id,prior:prior?.id,ready:CONFIG.ready});
        const asset = await this.asset(), stored = await this.pixels(asset.dataUrl); this.validate(record,stored);
        await this.page.locator('#maskPainterAppliedViewButton').click(); await settle(this.page);
        await this.page.locator(CONFIG.save).click(); await this.page.locator(CONFIG.modal).waitFor({state:'hidden'});
        const saved = await this.asset();
        await this.open(); assert.equal((await this.asset()).id,saved.id,'Saved native mask survives reopening');
        await this.page.locator('#maskPainterAppliedViewButton').click(); await settle(this.page);
        return stored;
    }
    async asset() {
        return this.page.evaluate(id=>{const project=BZNNewCanvasChrome.project(), layer=project.state.layers.find(layer=>layer.id===id);return project.assets.find(asset=>asset.id===layer.image.mask.assetId)||null;},CONFIG.id);
    }
}

const test = await workspace(), checks = new MaskSetChecks(test.page), report = [];
try {
    if (!process.env.BZN_PUBLISHED) await test.page.route(`${CONFIG.host}/**`,async route=>{
        const file=resolve(ROOT,decodeURIComponent(new URL(route.request().url()).pathname).slice(CONFIG.one));
        const type=Object.entries(CONFIG.types).find(([extension])=>file.endsWith(extension))?.[CONFIG.one];
        if (!file.startsWith(resolve(ROOT,SETTINGS.outputDirectory)+sep)||!existsSync(file)||!type) return route.abort();
        await route.fulfill({contentType:type,body:readFileSync(file)});
    });
    for(let cycle=CONFIG.zero;cycle<CONFIG.cycles;cycle+=CONFIG.one){
        await checks.fixture(cycle);
        for(const record of RECORDS){
            // Every resource receives an actual native gallery choice, save and reopen in each clean cycle.
            const bytes=readFileSync(join(ROOT,SETTINGS.outputDirectory,record.name)); assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
            const source=await checks.pixels(`data:image/svg+xml;base64,${bytes.toString('base64')}`); checks.validate(record,source);
            const stored=await checks.select(record); report.push({cycle,name:record.name,source,stored});
            await test.page.locator(CONFIG.modal).screenshot({path:join(CONFIG.output,`${cycle}-${record.key}.png`)});
        }
        await test.page.locator('#maskPainterCloseButton').click(); assert.deepEqual(test.errors,[]);
        console.log(`PASS ${CONFIG.settings} ${cycle+CONFIG.one}: ${RECORDS.length} native Use/save/reopen, aspect ${CONFIG.aspects[cycle]}, grayscale and silhouette`);
    }
    writeFileSync(join(CONFIG.output,'report.json'),JSON.stringify({report,errors:test.errors},null,CONFIG.two));console.log(CONFIG.output);
} catch(error){writeFileSync(join(CONFIG.output,'failure.txt'),String(error.stack||error));await test.page.screenshot({path:join(CONFIG.output,'failure.png')});console.error(CONFIG.output);throw error;}
finally {await test.close();}
