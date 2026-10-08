// Deterministic code-native edge rasters and rounded diagonal strips; no inference or raster-source rewriting.
import { readFile, writeFile, copyFile, mkdtemp, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StaticMaskSet } from './static-mask-set.mjs';
const LOCATIONS = Object.freeze({ root: path.resolve(import.meta.dirname, '../..'), configuration: 'config/raster-masks.json', argument: 1 });

export class RasterMaskSet extends StaticMaskSet {
    constructor(config) { super(config); this.goldenRatio = (config.one + Math.sqrt(config.goldenRoot)) / config.two; }
    /** Indexed noise stays stable across regeneration and mirrored orientations. */
    noise(column, row) {
        const config = this.config, value = Math.sin((column + config.seed) * config.noiseX + row * config.noiseY) * config.noiseScale;
        return value - Math.floor(value);
    }
    /** Successive columns use a continuously changing power of phi; all geometry remains within a clipped transition. */
    columns() {
        const config = this.config, columns = [], end = config.one - config.blackTail, transition = end - config.whiteTail;
        let x = config.whiteTail, index = config.zero;
        while (x < end) {
            // Loop: density grows only in the configured edge transition, preserving the white plateau.
            const progress = (x - config.whiteTail) / transition;
            const pitch = config.basePitch * this.goldenRatio ** (config.one - config.two * progress);
            columns.push({x,progress,pitch,index}); x += pitch; index += config.one;
        }
        return columns;
    }
    /** Dot and irregular-grain families share the same density law, with separate contour construction. */
    grains(family) {
        const config = this.config, shapes = [];
        for (const column of this.columns()) {
            const radius = column.pitch * config.radiusScale * column.progress ** config.growthExponent;
            let row = config.zero;
            for (let y = -config.outside; y < config.one + config.outside; y += column.pitch) {
                // Loop: bounded jitter breaks the lattice only for the grain reference; pure dots retain a readable raster.
                const jitter = family === 'grain' ? config.jitter : config.zero;
                const x = column.x + (this.noise(column.index,row) - config.half) * column.pitch * jitter;
                const centerY = y + (this.noise(row,column.index) - config.half) * column.pitch * jitter;
                if (family === 'dots') shapes.push(`<circle cx="${this.number(x)}" cy="${this.number(centerY)}" r="${this.number(radius)}"/>`);
                else {
                    const points = [];
                    for (let node = config.zero; node < config.grainNodes; node += config.one) {
                        // Contour: each grain has its own bounded roughness, without opacity or coloured pixels.
                        const angle = node / config.grainNodes * config.radiansTurn;
                        const size = radius * (config.one + (this.noise(column.index + node,row) - config.half) * config.grainRadiusNoise);
                        points.push(`${this.number(x + Math.cos(angle) * size)},${this.number(centerY + Math.sin(angle) * size)}`);
                    }
                    shapes.push(`<polygon points="${points.join(' ')}"/>`);
                }
                row += config.one;
            }
        }
        return shapes.join('');
    }
    /** Stripes change both thickness and phi-based gaps across the transition. */
    stripes() {
        const config = this.config, height = config.one + config.two * config.outside;
        return this.columns().map(column => {
            const width = column.pitch * column.progress ** config.growthExponent * config.stripeFill;
            return `<rect x="${this.number(column.x - width * config.half)}" y="${-config.outside}" width="${this.number(width)}" height="${height}"/>`;
        }).join('');
    }
    /** Rounded diagonal islands reproduce the capsule composition while keeping a small outside margin. */
    ribbons(variant) {
        const config = this.config, middle = (config.capsuleLengths.length - config.one) * config.half;
        return config.capsuleLengths.map((length,index) => {
            const base = variant.thin ? config.capsuleThinWidth : config.capsuleWidth;
            const width = base / this.goldenRatio ** (Math.abs(index - middle) * config.capsuleWidthsExponent);
            const x = config.half + (index - middle) * config.capsulePitch - width * config.half;
            return `<rect x="${this.number(x)}" y="${this.number(config.half - length * config.half)}" width="${this.number(width)}" height="${length}" rx="${this.number(width * config.half)}"/>`;
        }).join('');
    }
    /** One self-contained opaque SVG owns polarity, clipping and cardinal/mirrored orientation. */
    source(variant) {
        const config = this.config, isRibbon = variant.family === 'capsules', center = config.side * config.half;
        const transform = `translate(${center} ${center}) rotate(${variant.angle}) scale(${config.side}) translate(${-config.half} ${-config.half})`;
        const height = config.one + config.two * config.outside, end = config.one - config.blackTail;
        const clip = isRibbon
            ? `<rect x="${config.margin}" y="${config.margin}" width="${config.one - config.two * config.margin}" height="${config.one - config.two * config.margin}"/>`
            : `<rect x="${config.whiteTail}" y="${-config.outside}" width="${end - config.whiteTail}" height="${height}"/>`;
        const shapes = isRibbon ? `<g transform="${transform}" fill="white">${this.ribbons(variant)}</g>`
            : `<g transform="${transform}"><g clip-path="url(#transition)" fill="black">${variant.family === 'stripes' ? this.stripes() : this.grains(variant.family)}</g><rect x="${end}" y="${-config.outside}" width="${config.one}" height="${height}" fill="black"/></g>`;
        const clipping = isRibbon ? `<g transform="scale(${config.side})" clip-path="url(#transition)"><g transform="scale(${config.one / config.side})">${shapes}</g></g>` : shapes;
        const description = isRibbon ? `Белое показывает, чёрное скрывает. Толщина и шаг меняются с φ=${this.number(this.goldenRatio)}; крайние четверти растров полностью белая и чёрная.` : this.xml(config.edgeDescription);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${config.side}" height="${config.side}" viewBox="${config.zero} ${config.zero} ${config.side} ${config.side}">${config.luminanceMetadata}<title>${this.xml(variant.label)}</title><desc>${description}</desc><defs><clipPath id="transition">${clip}</clipPath></defs><rect width="${config.side}" height="${config.side}" fill="${isRibbon ? 'black' : 'white'}"/>${clipping}</svg>\n`;
    }

    /** An explicit migration updates only outputs still matching this set's recorded source hashes. */
    async refreshOwned(root = LOCATIONS.root) {
        const config = this.config, output = path.resolve(root, config.outputDirectory);
        const manifestPath = path.join(output, config.manifestName);
        const manifest = JSON.parse(await readFile(manifestPath, config.encoding)), records = await this.records(root);
        const changed = [];
        for (const record of records) {
            // Guard: every existing name and byte must belong to the previous owned manifest; unknown edits stop the entire migration.
            const previous = manifest.records.find(item => item.name === record.name && item.key === record.key);
            const currentHash = this.digest(await readFile(path.join(output, record.name)));
            if (!previous || currentHash !== previous.sha256) throw new Error(`Owned mask changed outside this migration: ${record.name}`);
            if (record.sha256 !== currentHash) changed.push(record);
        }
        if (!changed.length) return manifest.records;
        const backup = await mkdtemp(path.join(tmpdir(), config.backupPrefix));
        await copyFile(manifestPath, path.join(backup, config.manifestName));
        for (const record of changed) {
            // Preserve every affected previous source before the first replacement; stock and capsule assets are never written here.
            await copyFile(path.join(output, record.name), path.join(backup, record.name));
        }
        const timestamp = new Date(manifest.orderingTimestamp);
        for (const record of changed) {
            // Write only individually preflighted generated resources, retaining the existing gallery order.
            const filename = path.join(output, record.name);
            await writeFile(filename, record.source, config.encoding);
            await utimes(filename, timestamp, timestamp);
        }
        const metadata = records.map(({ source, ...record }) => record);
        await writeFile(manifestPath, JSON.stringify({ ...manifest, records: metadata }, null, config.two), config.encoding);
        console.log(`Preserved previous owned sources: ${backup}`);
        return metadata;
    }
}

/** Imports are read-only; explicit CLI publishes only this named set locally. */
async function main() {
    const config = JSON.parse(await readFile(path.join(LOCATIONS.root,LOCATIONS.configuration),'utf8'));
    const set = new RasterMaskSet(config);
    const records = process.argv.includes(config.ownedUpdateFlag) ? await set.refreshOwned() : await set.write();
    console.log(`Raster masks: ${records.length}, deterministic phi spacing and rounded diagonals.`);
}
if(process.argv[LOCATIONS.argument]&&path.resolve(process.argv[LOCATIONS.argument])===fileURLToPath(import.meta.url)) await main();
