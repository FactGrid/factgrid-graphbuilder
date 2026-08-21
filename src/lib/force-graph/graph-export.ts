import {jsPDF} from 'jspdf';
import {svg2pdf} from 'svg2pdf.js';
import {lightPalette} from './palette';
import type {GraphExportBounds, GraphExportLink, GraphExportNode, GraphExportPayload, Point} from './types';

const svgNs = 'http://www.w3.org/2000/svg';

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}) => {
	const element = document.createElementNS(svgNs, tag) as SVGElementTagNameMap[K];
	for (const [key, value] of Object.entries(attributes)) {
		element.setAttribute(key, String(value));
	}

	return element;
};

const linkPoints = (link: GraphExportLink) => {
	if (link.sections) {
		return link.sections.map(([x, y]) => `${x},${y}`).join(' ');
	}

	return `${link.source.x},${link.source.y} ${link.target.x},${link.target.y}`;
};

const arrowWhRatio = 1.6;
const arrowVlenRatio = 0.2;

const getArrowPolygonPoints = (link: GraphExportLink, arrowLength: number) => {
	let start: Point;
	let end: Point;
	let endR: number;

	if (link.sections) {
		const [x1, y1] = link.sections[link.sections.length - 2];
		const [x2, y2] = link.sections[link.sections.length - 1];
		start = {x: x1, y: y1};
		end = {x: x2, y: y2};
		endR = 0;
	} else {
		start = {x: link.source.x, y: link.source.y};
		end = {x: link.target.x, y: link.target.y};
		endR = link.target.radius;
	}

	const arrowHalfWidth = arrowLength / arrowWhRatio / 2;

	const getCoordsAlongLine = (t: number) => ({
		x: (start.x * (1 - t)) + (end.x * t),
		y: (start.y * (1 - t)) + (end.y * t),
	});

	const lineLength = Math.sqrt(((end.x - start.x) ** 2) + ((end.y - start.y) ** 2));
	if (lineLength === 0) {
		return undefined;
	}

	const posAlongLine = lineLength - endR;
	const arrowHead = getCoordsAlongLine(posAlongLine / lineLength);
	const arrowTail = getCoordsAlongLine((posAlongLine - arrowLength) / lineLength);
	const arrowTailVertex = getCoordsAlongLine((posAlongLine - (arrowLength * (1 - arrowVlenRatio))) / lineLength);
	const cos = (arrowHead.y - arrowTail.y) / arrowLength;
	const sin = -(arrowHead.x - arrowTail.x) / arrowLength;

	const p1 = arrowHead;
	const p2 = {x: arrowTail.x + (arrowHalfWidth * cos), y: arrowTail.y + (arrowHalfWidth * sin)};
	const p3 = arrowTailVertex;
	const p4 = {x: arrowTail.x - (arrowHalfWidth * cos), y: arrowTail.y - (arrowHalfWidth * sin)};

	return [p1, p2, p3, p4].map(p => `${p.x},${p.y}`).join(' ');
};

const addLinksAndArrows = (
	svg: SVGSVGElement,
	links: GraphExportLink[],
	color: string,
	width: number,
	arrowLength: number,
) => {
	if (width === 0 || links.length === 0) {
		return;
	}

	const linksGroup = el('g', {fill: 'none', stroke: color, 'stroke-width': width});
	for (const link of links) {
		linksGroup.append(el('polyline', {points: linkPoints(link)}));
	}

	svg.append(linksGroup);

	const arrowsGroup = el('g', {fill: color, stroke: 'none'});
	for (const link of links) {
		const points = getArrowPolygonPoints(link, arrowLength);
		if (points) {
			arrowsGroup.append(el('polygon', {points}));
		}
	}

	svg.append(arrowsGroup);
};

const addNode = (group: SVGGElement, node: GraphExportNode, isPointShape: boolean) => {
	if (isPointShape) {
		group.append(el('circle', {cx: node.x, cy: node.y, r: node.radius}));
	} else {
		group.append(el('rect', {x: node.x, y: node.y, width: node.textWidth + 10, height: node.textHeight + 10}));
	}
};

/**
 * Builds a standalone SVG element mirroring GraphEngine's canvas rendering
 * (src/lib/force-graph/graph-engine.ts paintCanvas), always in the light palette
 * regardless of the app's current theme, for use in file exports.
 */
export const buildGraphSvg = (payload: GraphExportPayload): SVGSVGElement => {
	const {bounds, isPointShape, nodes, links, shortcutsColor, shortcutsWidth, showLabels} = payload;

	const svg = el('svg', {
		xmlns: svgNs,
		viewBox: `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,
		width: bounds.width,
		height: bounds.height,
	});

	svg.append(el('rect', {
		x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, fill: lightPalette.backgroundColor,
	}));

	const arrowSizeBase = isPointShape ? 13 : 8;
	const nonShortcutLinks = links.filter(link => !link.isShortcut);
	const shortcutLinks = links.filter(link => link.isShortcut);

	addLinksAndArrows(svg, nonShortcutLinks, lightPalette.linksColor, 1, arrowSizeBase);
	addLinksAndArrows(svg, shortcutLinks, shortcutsColor, shortcutsWidth, arrowSizeBase * Math.sqrt(shortcutsWidth));

	const nodesGroup = el('g', {
		fill: isPointShape ? lightPalette.pointFill : lightPalette.blockFill,
		stroke: lightPalette.nodeStrokeColor,
		'stroke-width': 2,
	});
	for (const node of nodes) {
		if (!node.isRoot) {
			addNode(nodesGroup, node, isPointShape);
		}
	}

	svg.append(nodesGroup);

	const rootNode = nodes.find(node => node.isRoot);
	if (rootNode) {
		const rootGroup = el('g', {
			fill: isPointShape ? lightPalette.rootNodePointFill : lightPalette.rootNodeBlockFill,
			stroke: lightPalette.nodeStrokeColor,
			'stroke-width': 2,
		});
		addNode(rootGroup, rootNode, isPointShape);
		svg.append(rootGroup);
	}

	if (showLabels) {
		const labelsGroup = el('g', {
			'font-family': 'ui-sans-serif, system-ui, -apple-system, Arial, sans-serif',
			'font-size': 10,
			fill: lightPalette.textFillColor,
		});
		// `dominant-baseline` (hanging/middle) isn't reliably honored by svg2pdf.js, which falls
		// back to the default alphabetic baseline — so the label y-coordinates below are computed
		// as an alphabetic-baseline equivalent directly, instead of relying on dominant-baseline,
		// to render identically in both the browser (SVG) and svg2pdf.js (PDF).
		const fontSize = 10;
		const pointBaselineOffset = fontSize * 0.35;
		const blockBaselineOffset = fontSize * 0.8;

		for (const node of nodes) {
			const x = isPointShape ? node.x + node.radius + 1 : node.x + 5;
			const y = isPointShape ? node.y + pointBaselineOffset : node.y + 5 + blockBaselineOffset;

			// `paint-order: stroke` (draw the halo stroke behind the fill) isn't reliably honored by
			// svg2pdf.js either — it falls back to the default fill-then-stroke order, which paints the
			// white halo *over* the dark fill and makes the text look blank. Two separate elements (a
			// stroke-only halo appended first, the fill text appended after) rely on plain DOM paint
			// order instead, so it renders identically in the browser (SVG) and svg2pdf.js (PDF).
			if (isPointShape) {
				const halo = el('text', {x, y, 'text-anchor': 'start'});
				halo.setAttribute('fill', 'none');
				halo.setAttribute('stroke', lightPalette.textStrokeColor);
				halo.setAttribute('stroke-width', '3');
				halo.textContent = node.label;
				labelsGroup.append(halo);
			}

			const text = el('text', {x, y, 'text-anchor': 'start'});
			text.textContent = node.label;
			labelsGroup.append(text);
		}

		svg.append(labelsGroup);
	}

	return svg;
};

const triggerDownload = (blob: Blob, filename: string) => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
};

export const downloadGraphSvg = (svg: SVGSVGElement, filename: string) => {
	const source = new XMLSerializer().serializeToString(svg);
	const blob = new Blob([source], {type: 'image/svg+xml;charset=utf-8'});
	triggerDownload(blob, filename);
};

export const downloadGraphPdf = async (svg: SVGSVGElement, bounds: GraphExportBounds, filename: string) => {
	const pdf = new jsPDF({
		orientation: bounds.width >= bounds.height ? 'landscape' : 'portrait',
		unit: 'px',
		format: [bounds.width, bounds.height],
		compress: true,
	});

	await svg2pdf(svg, pdf, {x: 0, y: 0, width: bounds.width, height: bounds.height});
	pdf.save(filename);
};
