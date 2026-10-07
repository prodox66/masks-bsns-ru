// Generator: separate grayscale corner fades hide both opposite edges, preserving all earlier mask resources.
import { readFile, stat, utimes, mkdtemp, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GradientMaskSet } from './build-gradient-masks.mjs';
const LOCATIONS = Object.freeze({ root: path.resolve(import.meta.dirname, '../..'), configuration: 'config/corner-gradient-masks.json', scriptArgument: 1 });

/** One base generator owns naming/serialization; this subclass owns only corner contour geometry. */
export class CornerGradientMaskSet extends GradientMaskSet {
    constructor(config) {
        super(config);
        const outer = config.one - config.edgeCapture;
        for (const curve of config.curves) {
            // Guard: every bend retains the white square and at least25% completely hidden area.
            const inner = this.whiteExtent(curve);
            const area = outer * outer * (config.quadraticAreaBase + config.quadraticAreaFactor * curve.controlRatio);
            if (config.edgeCapture <= config.zero || inner >= outer || config.one - area < config.minimumBlackArea) throw new Error(`Invalid corner contour: ${curve.key}`);
        }
    }
    /** The diagonal midpoint sets the smallest contour containing the complete white corner square. */
    whiteExtent(curve) { return this.config.whiteTail / (this.config.quadraticMidBase + this.config.half * curve.controlRatio); }
    /** One quadratic joins two near-corner endpoints; both opposite edges remain fully black after any stretch. */
    source(direction, curve) {
        const config = this.config, contours = [], white = this.whiteExtent(curve);
        const transition = config.one - config.edgeCapture - white;
        for (let shade = config.one; shade <= config.fullChannel; shade += config.one) {
            // Loop: one quadratic segment bends only the transition, never the guaranteed black/white plateaus.
            const edge = white + (config.one - shade / config.fullChannel) * transition;
            const control = edge * curve.controlRatio;
            const shape = `M${config.zero} ${config.zero} L${this.number(edge)} ${config.zero} Q${this.number(control)} ${this.number(control)} ${config.zero} ${this.number(edge)} Z`;
            contours.push(`<path d="${shape}" fill="rgb(${shade} ${shade} ${shade})"/>`);
        }
        const offsetX = direction.x < config.zero ? config.side : config.zero;
        const offsetY = direction.y < config.zero ? config.side : config.zero;
        const transform = `translate(${offsetX} ${offsetY}) scale(${direction.x * config.side} ${direction.y * config.side})`;
        const title = this.xml(`Угловой градиент: ${direction.label}, ${curve.label}`);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${config.side}" height="${config.side}" viewBox="${config.zero} ${config.zero} ${config.side} ${config.side}">${config.luminanceMetadata}<title>${title}</title><desc>Белое показывает, чёрное скрывает. Белый угол ${this.number(config.whiteTail * config.percent)}%; две противоположные стороны полностью скрыты. Захват углов ${this.number(config.edgeCapture * config.percent)}%; полностью чёрная площадь не менее ${this.number(config.minimumBlackArea * config.percent)}%.</desc><rect width="${config.side}" height="${config.side}" fill="black"/><g transform="${transform}">${contours.join('')}</g></svg>\n`;
    }
    /** Check every owned name before the first filesystem mutation; earlier gradients are never rewritten. */
    async write(root = LOCATIONS.root) {
        const config = this.config, output = path.resolve(root, config.outputDirectory);
        const gradients = JSON.parse(await readFile(path.join(output, config.orderingManifestName), config.encoding));
        const timestamp = (await stat(path.join(output, gradients.records[config.zero].name))).mtime;
        let prior = { records: [] };
        try { prior = JSON.parse(await readFile(path.join(output, config.manifestName), config.encoding)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        const changed = [];
        for (const record of this.records()) {
            // Guard: each changed resource must still match the exact previously generated SHA before any writes.
            try {
                const bytes = await readFile(path.join(output, record.name));
                if (bytes.toString(config.encoding) === record.source) continue;
                const owned = prior.records.find(entry => entry.name === record.name);
                if (!owned || createHash('sha256').update(bytes).digest('hex') !== owned.sha256) throw new Error(`Existing corner mask differs: ${record.name}`);
                changed.push(record.name);
            }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        if (changed.length) {
            // Backup: preserve only this owned set and its prior manifest outside the public resource directory.
            const backup = await mkdtemp(path.join(tmpdir(), config.backupPrefix));
            for (const name of [...changed, config.manifestName]) await copyFile(path.join(output, name), path.join(backup, name));
            console.log(`Prior corner resources: ${backup}`);
        }
        const records = await super.write(root);
        for (const record of records) {
            // Loop: old18 gradients remain first; the12 corner variants fill the rest of their first page.
            await utimes(path.join(output, record.name), timestamp, timestamp);
        }
        return records;
    }
}

/** Imports have no filesystem effects; the explicit CLI creates only this named set. */
async function main() {
    const config = JSON.parse(await readFile(path.join(LOCATIONS.root, LOCATIONS.configuration), 'utf8'));
    const manifest = await new CornerGradientMaskSet(config).write();
    console.log(`Corner gradients: ${manifest.length} SVG, ${manifest.reduce((total, record) => total + record.bytes, config.zero)} bytes; white25%, two hidden edges, near-corner endpoints.`);
}
if (process.argv[LOCATIONS.scriptArgument] && path.resolve(process.argv[LOCATIONS.scriptArgument]) === fileURLToPath(import.meta.url)) await main();
