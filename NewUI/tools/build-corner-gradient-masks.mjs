// Generator: separate grayscale corner fades hide both opposite edges, preserving all earlier mask resources.
import { readFile, stat, utimes } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GradientMaskSet } from './build-gradient-masks.mjs';
const LOCATIONS = Object.freeze({ root: path.resolve(import.meta.dirname, '../..'), configuration: 'config/corner-gradient-masks.json', scriptArgument: 1 });

/** One base generator owns naming/serialization; this subclass owns only corner contour geometry. */
export class CornerGradientMaskSet extends GradientMaskSet {
    constructor(config) {
        super(config);
        if (config.blackTail < config.minimumBlackTail || config.whiteTail + config.blackTail >= config.one) throw new Error('Invalid corner plateaus.');
    }
    /** Higher opaque shades overwrite smaller contours; the white corner and black opposite bands are exact. */
    source(direction, curve) {
        const config = this.config, contours = [], white = config.whiteTail;
        const transition = config.one - config.blackTail - white;
        for (let shade = config.one; shade <= config.fullChannel; shade += config.one) {
            // Loop: one quadratic segment bends only the transition, never the guaranteed black/white plateaus.
            const edge = white + (config.one - shade / config.fullChannel) * transition;
            const control = white + (edge - white) * curve.controlRatio;
            const shape = `M${config.zero} ${config.zero} L${this.number(edge)} ${config.zero} L${this.number(edge)} ${this.number(white)} Q${this.number(control)} ${this.number(control)} ${this.number(white)} ${this.number(edge)} L${config.zero} ${this.number(edge)} Z`;
            contours.push(`<path d="${shape}" fill="rgb(${shade} ${shade} ${shade})"/>`);
        }
        const offsetX = direction.x < config.zero ? config.side : config.zero;
        const offsetY = direction.y < config.zero ? config.side : config.zero;
        const transform = `translate(${offsetX} ${offsetY}) scale(${direction.x * config.side} ${direction.y * config.side})`;
        const title = this.xml(`Угловой градиент: ${direction.label}, ${curve.label}`);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${config.side}" height="${config.side}" viewBox="${config.zero} ${config.zero} ${config.side} ${config.side}">${config.luminanceMetadata}<title>${title}</title><desc>Белое показывает, чёрное скрывает. Белый угол ${this.number(white * config.percent)}%; полностью чёрные противоположные края ${this.number(config.blackTail * config.percent)}%.</desc><rect width="${config.side}" height="${config.side}" fill="black"/><g transform="${transform}">${contours.join('')}</g></svg>\n`;
    }
    /** Check every owned name before the first filesystem mutation; earlier gradients are never rewritten. */
    async write(root = LOCATIONS.root) {
        const config = this.config, output = path.resolve(root, config.outputDirectory);
        const gradients = JSON.parse(await readFile(path.join(output, config.orderingManifestName), config.encoding));
        const timestamp = (await stat(path.join(output, gradients.records[config.zero].name))).mtime;
        for (const record of this.records()) {
            // Loop: only identical outputs of this separate set may already exist.
            try { if (await readFile(path.join(output, record.name), config.encoding) !== record.source) throw new Error(`Existing corner mask differs: ${record.name}`); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
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
    console.log(`Corner gradients: ${manifest.length} SVG, ${manifest.reduce((total, record) => total + record.bytes, config.zero)} bytes; black/white25%.`);
}
if (process.argv[LOCATIONS.scriptArgument] && path.resolve(process.argv[LOCATIONS.scriptArgument]) === fileURLToPath(import.meta.url)) await main();
