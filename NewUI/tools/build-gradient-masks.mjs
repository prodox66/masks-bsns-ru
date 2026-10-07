// Generator: deterministic opaque vector masks declare white-reveal polarity for the ready-mask importer.
import { readFile, writeFile, mkdir, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCATIONS = Object.freeze({ root: path.resolve(import.meta.dirname, '../..'), configuration: 'config/gradient-masks.json', scriptArgument: 1 });

// Class: dimensions, curves, ordering, and source serialization have one configuration owner.
export class GradientMaskSet {
    constructor(config) {
        this.config = Object.freeze(config);
        if (config.whiteTail < config.minimumWhiteTail || config.whiteTail >= config.one) throw new Error('Invalid white tail.');
    }
    // Function: stable decimals keep regeneration byte-identical.
    number(value) { return String(Number(value.toFixed(this.config.precision))); }
    // Function: labels stay text inside a self-contained SVG without external resources.
    xml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
    // Function: each rotated coordinate frame covers the complete square source, including both 45-degree diagonals.
    matrix(direction) {
        const config = this.config, squared = direction.x * direction.x + direction.y * direction.y;
        const extent = (Math.abs(direction.x) + Math.abs(direction.y)) / squared;
        const a = config.side * extent * direction.x, b = config.side * extent * direction.y, c = -b, d = a;
        const e = config.side * config.half - (a + c) * config.half;
        const f = config.side * config.half - (b + d) * config.half;
        return [a, b, c, d, e, f].map(value => this.number(value)).join(' ');
    }
    // Function: quadratic contours bend the white boundary while its farthest point keeps the full white tail.
    boundary(curve) {
        const config = this.config, end = config.one - config.whiteTail;
        // Branch: inward and outward boundaries mirror the curvature; linear retains its straight perpendicular edge.
        if (curve.key === 'concave') return { edge: end - config.curvature, control: end + config.curvature };
        if (curve.key === 'convex') return { edge: end, control: end - config.two * config.curvature };
        return { edge: end, control: end };
    }
    // Function: opaque nested luminance contours prevent gaps and remain visible on the gallery's white underlay.
    source(direction, curve) {
        const config = this.config, boundary = this.boundary(curve), contours = [];
        for (let shade = config.one; shade <= config.fullChannel; shade += config.one) {
            // Loop: each higher contour overwrites the preceding shade rather than accumulating semi-transparent fills.
            const fraction = shade / config.fullChannel, edge = this.number(fraction * boundary.edge), control = this.number(fraction * boundary.control);
            const shape = `M${edge} ${config.zero} Q${control} ${config.half} ${edge} ${config.one} L${config.one} ${config.one} L${config.one} ${config.zero} Z`;
            contours.push(`<path d="${shape}" fill="rgb(${shade} ${shade} ${shade})"/>`);
        }
        const title = this.xml(`Градиент: ${direction.label}, ${curve.label}`);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${config.side}" height="${config.side}" viewBox="${config.zero} ${config.zero} ${config.side} ${config.side}">${config.luminanceMetadata}<title>${title}</title><desc>Белый край ${this.number(config.whiteTail * config.percent)}% направления; белое показывает, чёрное скрывает.</desc><rect width="${config.side}" height="${config.side}" fill="black"/><g transform="matrix(${this.matrix(direction)})">${contours.join('')}</g></svg>\n`;
    }
    // Function: one ordered cross-product owns file names and gallery order.
    records() {
        const config = this.config, records = [];
        for (const direction of config.directions) {
            // Loop: all three boundary types remain adjacent for one direction.
            for (const curve of config.curves) {
                const index = String(records.length + config.one).padStart(config.indexWidth, String(config.zero));
                const name = [config.filePrefix, index, direction.label, curve.label].join(config.separator).replaceAll(' ', config.separator) + '.svg';
                records.push({ name, direction, curve, source: this.source(direction, curve) });
            }
        }
        return records;
    }
    // Function: source resources are separate from Git and never replace an existing mask with different bytes.
    async write(root = LOCATIONS.root) {
        const config = this.config, output = path.resolve(root, config.outputDirectory), records = this.records(), manifest = [];
        await mkdir(output, { recursive: true });
        let priorManifest = [];
        try { priorManifest = JSON.parse(await readFile(path.join(output, config.manifestName), config.encoding)).records || []; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        const timestamp = new Date();
        for (const record of records) {
            // Loop: a collision is rejected before writing; all generated resources share one newest-first time.
            const target = path.join(output, record.name);
            let prior;
            try { prior = await readFile(target, config.encoding); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
            const previousRecord = priorManifest.find(entry => entry.name === record.name);
            const isUnmodifiedGeneratedSource = previousRecord && previousRecord.sha256 === createHash('sha256').update(prior || '').digest('hex');
            // Branch: only a byte-verified earlier output of this generator can receive a format update.
            if (prior !== undefined && prior !== record.source && !isUnmodifiedGeneratedSource) throw new Error(`Existing mask differs: ${record.name}`);
            await writeFile(target, record.source, config.encoding); await utimes(target, timestamp, timestamp);
            manifest.push({ name: record.name, direction: record.direction.key, curve: record.curve.key,
                sha256: createHash('sha256').update(record.source).digest('hex'), bytes: Buffer.byteLength(record.source) });
        }
        await writeFile(path.join(output, config.manifestName), JSON.stringify({ whiteTail: config.whiteTail, records: manifest }, null, config.two), config.encoding);
        return manifest;
    }
}

// Function: direct CLI execution generates only this set; importing the class has no filesystem effects.
async function main() {
    const config = JSON.parse(await readFile(path.join(LOCATIONS.root, LOCATIONS.configuration), 'utf8'));
    const manifest = await new GradientMaskSet(config).write();
    console.log(`Gradient masks generated: ${manifest.length} SVG files, ${manifest.reduce((total, record) => total + record.bytes, config.zero)} bytes.`);
}
if (process.argv[LOCATIONS.scriptArgument] && path.resolve(process.argv[LOCATIONS.scriptArgument]) === fileURLToPath(import.meta.url)) await main();
