// Code-native SVG wrappers fit the measured ink footprint while preserving every original raster byte.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StaticMaskSet } from './static-mask-set.mjs';
const LOCATIONS = Object.freeze({ root: path.resolve(import.meta.dirname, '../..'), configuration: 'config/fitted-masks.json', argument: 1 });

export class FittedMaskSet extends StaticMaskSet {
    /** Embedded source and exact measured crop are owned by the variant, never by runtime heuristics. */
    async source(variant, root) {
        const config = this.config, bytes = await readFile(path.join(root, config.outputDirectory, variant.sourceName));
        if (this.digest(bytes) !== variant.sourceSha) throw new Error(`Original source changed: ${variant.sourceName}`);
        const [left, top, right, bottom] = variant.bounds;
        if (left < config.zero || top < config.zero || right > variant.width || bottom > variant.height || left >= right || top >= bottom) throw new Error(`Invalid measured bounds: ${variant.key}`);
        const inset = config.side * config.margin, extent = config.side - config.two * inset;
        const matrix = variant.mode === config.alphaMode ? config.alphaMatrix : config.luminanceMatrix;
        const dataUrl = `data:${config.mimeByExtension[path.extname(variant.sourceName)]};base64,${bytes.toString(config.base64Encoding)}`;
        const content = `<svg x="${this.number(inset)}" y="${this.number(inset)}" width="${this.number(extent)}" height="${this.number(extent)}" viewBox="${left} ${top} ${right - left} ${bottom - top}" preserveAspectRatio="none" overflow="hidden"><image width="${variant.width}" height="${variant.height}" href="${dataUrl}" filter="url(#${config.filterId})"/></svg>`;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${config.side}" height="${config.side}" viewBox="${config.zero} ${config.zero} ${config.side} ${config.side}">${config.luminanceMetadata}<title>${this.xml(variant.label)}</title><desc>Белое показывает; чёрное скрывает. Измеренные пустые поля убраны; отступ ${this.number(config.margin * config.percent)}%. Исходник сохранён.</desc><defs><filter id="${config.filterId}" x="${config.zero}" y="${config.zero}" width="${config.one}" height="${config.one}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${matrix}"/></filter></defs><rect width="${config.side}" height="${config.side}" fill="black"/>${content}</svg>\n`;
    }
}

/** Explicit CLI creates only these named variants; imports have no filesystem effects. */
async function main() {
    const config = JSON.parse(await readFile(path.join(LOCATIONS.root, LOCATIONS.configuration), 'utf8'));
    const records = await new FittedMaskSet(config).write();
    console.log(`Fitted masks: ${records.length}; originals preserved, margin ${config.margin * config.percent}%.`);
}
if (process.argv[LOCATIONS.argument] && path.resolve(process.argv[LOCATIONS.argument]) === fileURLToPath(import.meta.url)) await main();
