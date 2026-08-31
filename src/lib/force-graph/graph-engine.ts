/* eslint-disable @typescript-eslint/prefer-readonly */

import {ForceEngine} from './force-engine';
import {ElkEngine} from './elk-engine';
import {SparqlGraphData} from './graph-data';
import {layoutConnectedSubgraph} from './simple-layered-layout';
import {lightPalette, darkPalette} from './palette';
import type {Canvas, CanvasContext, GraphLayout, GraphEngineNotifier, LayoutEngine, LinkObject, NodeObject, Point, SearchObject, ShortcutsMode, VisParameters, GraphNotifier, ElkDirection, GraphExportPayload, GraphExportBounds} from './types';

type DragObject = NodeObject & {
	__initialDragPos?: {x: number; y: number; fx: number | undefined; fy: number | undefined};
	x: number;
	y: number;
	fx: number | undefined;
	fy: number | undefined;
};

type DrawNode = NodeObject & {
	x: number;
	y: number;
};

type ZoomSettings = {x: number; y: number; k: number};

export class GraphEngine implements GraphEngineNotifier {
	private engine!: LayoutEngine;
	private hoverObject: SearchObject | undefined;

	private graphData: SparqlGraphData = new SparqlGraphData();
	private devicePixelRatio = 1;

	private abortController: AbortController | undefined;
	private shortcutAbortController: AbortController | undefined;
	private pinnedNodeId: string | undefined;
	private layoutErrorPending = false;
	private zoomTransform: ZoomSettings = {x: 0, y: 0, k: 1};
	private focusedNodes: Set<NodeObject> | undefined;
	private focusedLinks: Set<LinkObject> | undefined;

	private backgroundColor = lightPalette.backgroundColor;

	private shortcutsColor = '#4a6c93';
	private shortcutsWidth = 1;
	private showLabels = true;
	private linksColor = lightPalette.linksColor;
	private linksWidth = 1;
	private pointOffset = 1;
	private forwardHighlightColor = lightPalette.forwardHighlightColor;
	private reverseHighlightColor = lightPalette.reverseHighlightColor;
	private highlightLinksWidth = 5;

	private nodeStrokeColor = lightPalette.nodeStrokeColor;
	private hoverStrokeColor = lightPalette.hoverStrokeColor;
	private hoverFillColor = lightPalette.hoverFillColor;
	private textStrokeColor = lightPalette.textStrokeColor;
	private textFillColor = lightPalette.textFillColor;

	private forwardNodes = new Set<NodeObject>();
	private forwardLinks = new Set<LinkObject>();

	private reverseNodes = new Set<NodeObject>();
	private reverseLinks = new Set<LinkObject>();

	private animationFrameRequestId: number | undefined;

	private readonly canvas: Canvas;
	private readonly shadowCanvas: Canvas;
	private readonly ctx: CanvasContext;
	private readonly shadowCtx: CanvasContext;

	private needsRedraw = false;

	private autoPauseRedraw = true;

	private isZoomDragging = false;
	private isPointerDragging = false;
	private pointerPos: Point = {x: -1e12, y: -1e12};

	private hoverNode: NodeObject | undefined = undefined;
	private nodeLineWidth = 2;

	private pointFill = lightPalette.pointFill;
	private blockFill = lightPalette.blockFill;
	private rootNodePointFill = lightPalette.rootNodePointFill;
	private rootNodeBlockFill = lightPalette.rootNodeBlockFill;

	constructor(canvas: Canvas, visParameters: VisParameters, private readonly graphNotifier: GraphNotifier) {
		this.setVisParameters(visParameters);

		this.canvas = canvas;
		if (typeof OffscreenCanvas === 'undefined') {
			this.shadowCanvas = new HTMLCanvasElement();
			this.shadowCanvas.width = canvas.width;
			this.shadowCanvas.height = canvas.height;
		} else {
			this.shadowCanvas = new OffscreenCanvas(canvas.width, canvas.height);
		}

		this.ctx = this.canvas.getContext('2d', {alpha: false}) as CanvasContext;
		this.shadowCtx = this.shadowCanvas.getContext('2d', {willReadFrequently: true, alpha: false})! as CanvasContext;

		this.animate();
	}

	public onZoomTransform(t: ZoomSettings) {
		this.isZoomDragging = true;
		this.zoomTransform = t;

		for (const ctx of [this.ctx, this.shadowCtx]) {
			ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
			ctx.translate(t.x, t.y);
			ctx.scale(t.k, t.k);
		}

		this.needsRedraw = true;
	}

	public onZoomTransformEnd() {
		this.isZoomDragging = false;
	}

	public onLayoutComplete(x: number, y: number, width: number, height: number) {
		this.graphNotifier.onLayoutComplete(x, y, width, height);
	}

	public onLayoutError(message: string) {
		this.layoutErrorPending = true;
		this.graphNotifier.setError(message);
		this.graphNotifier.setState('error');
	}

	// The force-directed layout keeps ticking (and moving nodes) for up to 15s after load
	// (see ForceEngine's cooldownTime), so `lastBounds` — captured once right after the initial
	// warmup ticks in onLayoutComplete — goes stale and can crop the export. Recomputing the
	// bounds from the nodes' current positions at export time keeps it correct for both layouts.
	private computeExportBounds(isPointShape: boolean, showLabels: boolean): GraphExportBounds {
		const nodes = this.graphData.nodes;
		if (nodes.length === 0) {
			return {x: 0, y: 0, width: 100, height: 100};
		}

		const padding = 10;
		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;

		for (const node of nodes) {
			const x = node.x!;
			const y = node.y!;

			if (isPointShape) {
				const labelWidth = showLabels ? this.pointOffset + node.textWidth : 0;
				const halfTextHeight = showLabels ? node.textHeight / 2 : 0;
				minX = Math.min(minX, x - node.radius);
				maxX = Math.max(maxX, x + node.radius + labelWidth);
				minY = Math.min(minY, y - Math.max(node.radius, halfTextHeight));
				maxY = Math.max(maxY, y + Math.max(node.radius, halfTextHeight));
			} else {
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x + node.textWidth + 10);
				minY = Math.min(minY, y);
				maxY = Math.max(maxY, y + node.textHeight + 10);
			}
		}

		return {
			x: minX - padding,
			y: minY - padding,
			width: (maxX - minX) + (2 * padding),
			height: (maxY - minY) + (2 * padding),
		};
	}

	public exportGraph(requestId: string) {
		const isPointShape = this.graphData.nodes[0]?.shape === 'point';
		const rootNode = this.graphData.rootNode;
		const showLabels = !isPointShape || this.showLabels;

		const payload: GraphExportPayload = {
			bounds: this.computeExportBounds(isPointShape, showLabels),
			isPointShape,
			shortcutsColor: this.shortcutsColor,
			shortcutsWidth: this.shortcutsWidth,
			showLabels,
			nodes: this.graphData.nodes.map(node => ({
				x: node.x!,
				y: node.y!,
				radius: node.radius,
				textWidth: node.textWidth,
				textHeight: node.textHeight,
				label: node.label,
				isRoot: node === rootNode,
			})),
			links: this.graphData.viewLinks.map(link => ({
				sections: link.sections,
				source: {x: link.source.x!, y: link.source.y!, radius: link.source.radius},
				target: {x: link.target.x!, y: link.target.y!, radius: link.target.radius},
				isShortcut: link.isShortcut,
			})),
		};

		this.graphNotifier.onGraphExportReady(requestId, payload);
	}

	public setVisParameters(visParameters: VisParameters) {
		this.setLayoutOptions(visParameters.graphDirection);

		this.shortcutsMode = visParameters.shortcutsMode;
		this.shortcutsWidth = visParameters.shortcutsWidth;
		this.shortcutsColor = visParameters.shortcutsColor;
		this.showLabels = visParameters.showLabels;

		this.needsRedraw = true;
	}

	public setTheme(theme: 'light' | 'dark') {
		const palette = theme === 'dark' ? darkPalette : lightPalette;
		Object.assign(this, palette);
		this.needsRedraw = true;
	}

	public requestRedraw() {
		this.needsRedraw = true;
	}

	public async load(query: string, rootNode: string | undefined) {
		this.abort();
		this.shortcutAbortController?.abort();
		this.shortcutAbortController = undefined;
		this.pinnedNodeId = undefined;
		this.layoutErrorPending = false;
		this.focusedNodes = undefined;
		this.focusedLinks = undefined;
		this.graphNotifier.setIsolatedConnectionsLabel(undefined);

		this.graphNotifier.setState('loading');
		this.graphNotifier.setShortcutStatus({skipped: false});

		this.abortController = new AbortController();
		try {
			await this.graphData.loadFromSparql(
				query,
				rootNode,
				this.abortController.signal,
			);
			this.clearCanvas(this.ctx, this.backgroundColor);
			this.clearCanvas(this.shadowCtx);
			this.engine.setGraphData(this.graphData);
			// setGraphData() can synchronously call onLayoutError (e.g. ElkEngine refusing a graph
			// that's too large) — don't clobber that with 'ok' if it just happened.
			if (!this.layoutErrorPending) {
				this.graphNotifier.setState('ok');
				this.graphNotifier.setShortcutStatus({skipped: this.graphData.shortcutDetectionSkipped});
			}
		} catch (error_: unknown) {
			if ((error_ as Error).name !== 'AbortError') {
				this.graphNotifier.setError((error_ as Error).message);
				this.graphNotifier.setState('error');
			}
		} finally {
			this.abortController = undefined;
		}
	}

	public async computeShortcuts() {
		this.shortcutAbortController?.abort();
		const abortController = new AbortController();
		this.shortcutAbortController = abortController;

		await this.graphData.computeShortcuts(
			(processed, total) => {
				if (abortController.signal.aborted) {
					return;
				}

				this.graphNotifier.setShortcutStatus({
					skipped: this.graphData.shortcutDetectionSkipped,
					progress: processed < total ? {processed, total} : undefined,
				});
				this.needsRedraw = true;
			},
			abortController.signal,
		);

		if (abortController.signal.aborted) {
			return;
		}

		this.shortcutAbortController = undefined;
		this.graphNotifier.setShortcutStatus({skipped: this.graphData.shortcutDetectionSkipped});
		this.needsRedraw = true;
	}

	public setPinnedNode(nodeId: string | undefined) {
		this.pinnedNodeId = nodeId;

		if (nodeId === undefined) {
			this.forwardNodes.clear();
			this.forwardLinks.clear();
			this.reverseNodes.clear();
			this.reverseLinks.clear();
		} else {
			const node = this.graphData.nodesMap.get(nodeId);
			if (node) {
				({childrenNodes: this.forwardNodes, childrenLinks: this.forwardLinks} = this.graphData.getConnectedNodes(node, 'forward'));
				({childrenNodes: this.reverseNodes, childrenLinks: this.reverseLinks} = this.graphData.getConnectedNodes(node, 'reverse'));
			}
		}

		this.needsRedraw = true;
	}

	// Shows exactly what "Highlight connections" highlights (everything reachable forward and
	// reverse from one node) as its own small, clean tree — for a huge, densely-branching graph,
	// drawing everything else is both slow and beside the point once you've picked a specific node
	// to trace. The full graph's data and positions are never discarded, so switching back is just
	// re-running the (already fast, O(V+E)) layout again rather than restoring a cache.
	public setIsolatedConnections(nodeId: string | undefined) {
		if (nodeId === undefined) {
			this.focusedNodes = undefined;
			this.focusedLinks = undefined;
			this.graphNotifier.setIsolatedConnectionsLabel(undefined);
			this.engine.setGraphData(this.graphData);
			this.needsRedraw = true;
			return;
		}

		const targetNode = this.graphData.nodesMap.get(nodeId);
		if (!targetNode) {
			return;
		}

		const {childrenNodes: forwardNodes, childrenLinks: forwardLinks} = this.graphData.getConnectedNodes(targetNode, 'forward');
		const {childrenNodes: reverseNodes, childrenLinks: reverseLinks} = this.graphData.getConnectedNodes(targetNode, 'reverse');

		const bounds = layoutConnectedSubgraph(targetNode, forwardNodes, reverseNodes);

		this.focusedNodes = new Set([targetNode, ...forwardNodes, ...reverseNodes]);
		this.focusedLinks = new Set([...forwardLinks, ...reverseLinks]);
		this.graphNotifier.setIsolatedConnectionsLabel(targetNode.label);
		this.graphNotifier.onLayoutComplete(bounds.x, bounds.y, bounds.width, bounds.height);
		this.needsRedraw = true;
	}

	public setPointerPos(point: Point) {
		this.pointerPos = point;
	}

	public onDragStart(nodeId: string, active: number) {
		const node = this.graphData.nodesMap.get(nodeId)! as DragObject;
		node.__initialDragPos = {x: node.x, y: node.y, fx: node.fx, fy: node.fy};

		// Keep engine running at low intensity throughout drag
		if (!active) {
			node.fx = node.x;
			node.fy = node.y; // Fix points
		}
	}

	public onDrag(nodeId: string, dragPos: Point) {
		this.isPointerDragging = true;

		const node = this.graphData.nodesMap.get(nodeId)! as DragObject;
		node.x = dragPos.x;
		node.fx = dragPos.x;
		node.y = dragPos.y;
		node.fy = dragPos.y;

		this.engine.onDrag?.();
		this.needsRedraw = true;
	}

	public onDragEnd(nodeId: string) {
		this.isPointerDragging = false;

		const node = this.graphData.nodesMap.get(nodeId)! as DragObject;

		const initPos = node.__initialDragPos!;
		if (initPos.fx === undefined) {
			node.fx = undefined;
		}

		if (initPos.fy === undefined) {
			node.fy = undefined;
		}

		delete (node.__initialDragPos);

		this.engine.onDragEnd?.();
	}

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	public onPointerDown() {}

	public onPointerUp(button: number) {
		if (this.isPointerDragging || this.isZoomDragging) {
			this.isPointerDragging = false;
			return; // Don't trigger click events after pointer drag (pan / node drag functionality)
		}

		requestAnimationFrame(() => { // Trigger click events asynchronously, to allow hoverObj to be set (on frame)
			if (button === 0 && this.hoverObject?.type === 'Node') {
				const node = this.hoverObject.object;
				if (this.graphData.isLargeGraph) {
					this.graphNotifier.onNodeContextMenu({
						nodeId: node.id,
						url: node.url,
						label: node.label,
						pos: this.pointerPos,
						canIsolateConnections: this.graphData.treeParent !== undefined,
					});
				} else {
					this.graphNotifier.onNodeClicked(node.url);
				}
			}
		});
	}

	public adjustCanvasSize(width: number, height: number, devicePixelRatio: number) {
		this.devicePixelRatio = devicePixelRatio;
		let curWidth = this.canvas.width;
		let curHeight = this.canvas.height;
		if (curWidth === 300 && curHeight === 150) {
			curWidth = 0;
			curHeight = 0;
		}

		// Resize canvases
		for (const canvas of [this.canvas, this.shadowCanvas]) {
			// Memory size (scaled to avoid blurriness)
			canvas.width = width * devicePixelRatio;
			canvas.height = height * devicePixelRatio;

			// Normalize coordinate system to use css pixels (on init only)
			if (!curWidth && !curHeight) {
				this.ctx.scale(devicePixelRatio, devicePixelRatio);
			}
		}

		this.needsRedraw = true;
	}

	public pauseAnimation() {
		if (this.animationFrameRequestId) {
			window.cancelAnimationFrame(this.animationFrameRequestId);
			this.animationFrameRequestId = undefined;
		}
	}

	public resumeAnimation() {
		if (!this.animationFrameRequestId) {
			this.animate();
		}
	}

	public destroy() {
		this.abort();
		this.pauseAnimation();
	}

	private clearCanvas(ctx: CanvasContext, color = '#000000') {
		ctx.save();
		ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
		if (color === '#000000') {
			ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		} else {
			ctx.fillStyle = color;
			ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		}

		ctx.restore(); // Restore transforms
	}

	private abort() {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = undefined;
			this.graphNotifier.setState('ok');
		}
	}

	private onLinkHover?(link: LinkObject | undefined, previousLink: LinkObject | undefined): void;
	private onNodeHover(node: NodeObject | undefined, previousNode: NodeObject | undefined) {
		// On large graphs, forward/reverse highlighting is driven exclusively by setPinnedNode
		// (triggered from a click, not continuous hover) — see onPointerUp/onNodeContextMenu.
		if (!this.graphData.isLargeGraph) {
			if (node) {
				({childrenNodes: this.forwardNodes, childrenLinks: this.forwardLinks} = this.graphData.getConnectedNodes(node, 'forward'));
				({childrenNodes: this.reverseNodes, childrenLinks: this.reverseLinks} = this.graphData.getConnectedNodes(node, 'reverse'));
			} else {
				this.forwardNodes.clear();
				this.forwardLinks.clear();
				this.reverseNodes.clear();
				this.reverseLinks.clear();
			}
		}

		this.hoverNode = node ?? undefined;
		this.needsRedraw = true;
	}

	// eslint-disable-next-line complexity
	// Large graphs keep every node/link positioned at all times, but only bother drawing (and, for
	// hierarchical layouts, label-rendering) whatever actually falls in the current viewport — with
	// a tree of tens of thousands of labeled boxes, redrawing the entire graph on every pan/zoom
	// frame is what makes panning feel sluggish, and almost none of it is ever on screen at once.
	// A world-space margin around the viewport avoids nodes visibly popping in/out right at the edge.
	private getVisibleBounds() {
		const margin = 200;
		const cssWidth = this.canvas.width / this.devicePixelRatio;
		const cssHeight = this.canvas.height / this.devicePixelRatio;
		const {x: tx, y: ty, k} = this.zoomTransform;
		return {
			minX: (-tx / k) - margin,
			maxX: ((cssWidth - tx) / k) + margin,
			minY: (-ty / k) - margin,
			maxY: ((cssHeight - ty) / k) + margin,
		};
	}

	private isNodeInBounds(node: NodeObject, bounds: {minX: number; maxX: number; minY: number; maxY: number}) {
		return node.x! >= bounds.minX && node.x! <= bounds.maxX && node.y! >= bounds.minY && node.y! <= bounds.maxY;
	}

	private paintCanvas() {
		const ctx = this.ctx;
		const isPoint = this.graphData.nodes[0]?.shape === 'point';

		// Isolated connections (see setIsolatedConnections) always win over viewport culling — it's
		// already a small, deliberately chosen set, and should stay visible regardless of where the
		// view has been panned to since focusing.
		const bounds = (!this.focusedNodes && this.graphData.isLargeGraph) ? this.getVisibleBounds() : undefined;
		const visibleNodes = (this.focusedNodes ?? (bounds ? this.graphData.nodes.filter(node => this.isNodeInBounds(node, bounds)) : this.graphData.nodes)) as Iterable<DrawNode>;

		// Draw links
		const links = this.focusedLinks ?? (bounds
			? this.graphData.viewLinks.filter(link => this.isNodeInBounds(link.source, bounds) || this.isNodeInBounds(link.target, bounds))
			: this.graphData.viewLinks);
		if (this.shortcutsColor === this.linksColor && this.shortcutsWidth === this.linksWidth) {
			ctx.strokeStyle = this.linksColor;
			ctx.lineWidth = this.linksWidth;
			drawLinks(links, ctx);
		} else {
			ctx.strokeStyle = this.linksColor;
			ctx.lineWidth = this.linksWidth;
			drawLinks(links, ctx, x => !x.isShortcut);

			if (this.shortcutsWidth !== 0) {
				ctx.strokeStyle = this.shortcutsColor;
				ctx.lineWidth = this.shortcutsWidth;
				drawLinks(links, ctx, x => x.isShortcut);
			}
		}

		if (this.forwardLinks.size > 0) {
			ctx.strokeStyle = this.forwardHighlightColor;
			ctx.lineWidth = this.highlightLinksWidth;
			drawLinks(this.forwardLinks, ctx);
		}

		if (this.reverseLinks.size > 0) {
			ctx.strokeStyle = this.reverseHighlightColor;
			ctx.lineWidth = this.highlightLinksWidth;
			drawLinks(this.reverseLinks, ctx);
		}

		// Draw arrows — skipped on large force-directed graphs: at hairball density they're
		// indistinguishable dots anyway, and the per-link trigonometry is one of the more expensive
		// parts of a redraw. Large hierarchical (block-shape) layouts keep arrows — they're static,
		// far less dense per screen area, and the direction cue is worth keeping in a tree view.
		if (!(this.graphData.isLargeGraph && isPoint)) {
			const arrowsSizeBase = isPoint ? 13 : 8;
			const arrowsSize = arrowsSizeBase * Math.sqrt(this.linksWidth);
			const shortcutsArrowsSize = arrowsSizeBase * Math.sqrt(this.shortcutsWidth);

			if (this.shortcutsColor === this.linksColor && this.shortcutsWidth === this.linksWidth) {
				const arrowsFilter = this.shortcutsWidth === 0 ? ((link: LinkObject) => !link.isShortcut) : undefined;
				ctx.fillStyle = this.linksColor;
				drawArrows(links, arrowsSize, ctx, arrowsFilter);
			} else {
				ctx.strokeStyle = this.linksColor;
				ctx.fillStyle = this.linksColor;
				drawArrows(links, arrowsSize, ctx, link => !link.isShortcut);

				if (this.shortcutsWidth !== 0) {
					ctx.fillStyle = this.shortcutsColor;
					drawArrows(links, shortcutsArrowsSize, ctx, link => link.isShortcut);
				}
			}
		}

		// Draw nodes
		ctx.strokeStyle = this.nodeStrokeColor;
		ctx.lineWidth = this.nodeLineWidth;
		ctx.fillStyle = isPoint ? this.pointFill : this.blockFill;
		drawNodes(visibleNodes, ctx);

		const rootNode = this.graphData.rootNode as DrawNode;
		if (rootNode) {
			ctx.strokeStyle = this.nodeStrokeColor;
			ctx.lineWidth = this.nodeLineWidth;
			ctx.fillStyle = isPoint ? this.rootNodePointFill : this.rootNodeBlockFill;
			drawNodes([rootNode], ctx);
		}

		if (this.forwardNodes.size > 0) {
			ctx.fillStyle = this.forwardHighlightColor;
			ctx.lineWidth = 5;
			ctx.strokeStyle = this.forwardHighlightColor;
			drawNodes(this.forwardNodes as Iterable<DrawNode>, ctx);
		}

		if (this.reverseNodes.size > 0) {
			ctx.fillStyle = this.reverseHighlightColor;
			ctx.lineWidth = 5;
			ctx.strokeStyle = this.reverseHighlightColor;
			drawNodes(this.reverseNodes as Iterable<DrawNode>, ctx);
		}

		if (this.hoverNode) {
			ctx.strokeStyle = this.hoverStrokeColor;
			ctx.lineWidth = 5;
			ctx.fillStyle = this.hoverFillColor;
			drawNodes([this.hoverNode as DrawNode], ctx);
		}

		// The "show labels" toggle only applies to the force-directed (point-shape) layout —
		// hierarchical (block-shape) layouts always show labels, since the text is the node itself.
		// Large force-directed graphs skip labels regardless of the setting: tens of thousands of
		// overlapping strokeText/fillText calls in a hairball are both unreadable and the single
		// biggest per-frame redraw cost. Large hierarchical layouts keep labels — the box *is* the
		// label there, and unlike the hairball the tree layout is static, not continuously animated.
		if (!(this.graphData.isLargeGraph && isPoint) && (!isPoint || this.showLabels)) {
			ctx.beginPath();
			ctx.font = '10px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';
			ctx.textAlign = 'left';
			ctx.textBaseline = isPoint ? 'middle' : 'hanging';
			ctx.lineWidth = 1;
			ctx.strokeStyle = this.textStrokeColor;
			ctx.fillStyle = this.textFillColor;

			for (const node of visibleNodes) {
				const x = isPoint ? node.x + node.radius + this.pointOffset : node.x + 5;
				const y = isPoint ? node.y : node.y + 5;
				if (isPoint) {
					ctx.strokeText(node.label, x, y);
				}

				ctx.fillText(node.label, x, y);
			}
		}
	}

	private paintShadowCanvas() {
		const ctx = this.shadowCtx;

		const bounds = (!this.focusedNodes && this.graphData.isLargeGraph) ? this.getVisibleBounds() : undefined;
		const nodes = (this.focusedNodes ?? (bounds ? this.graphData.nodes.filter(node => this.isNodeInBounds(node, bounds)) : this.graphData.nodes)) as Iterable<DrawNode>;
		const isPoint = this.graphData.nodes[0]?.shape === 'point';

		for (const node of nodes) {
			if (isPoint) {
				const {textWidth, radius, x, y, indexColor} = node;
				ctx.fillStyle = indexColor;
				ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
				ctx.fillRect(x + radius + this.pointOffset, y - 5, textWidth, 10);
			} else {
				const {textWidth, textHeight, x, y, indexColor} = node;
				ctx.fillStyle = indexColor;
				ctx.fillRect(
					x - (this.nodeLineWidth / 2), y - (this.nodeLineWidth / 2),
					textWidth + 10 + this.nodeLineWidth, textHeight + 10 + this.nodeLineWidth,
				);
			}
		}
	}

	private get shortcutsMode() {
		return this.graphData.shortcutsMode;
	}

	private set shortcutsMode(shortcutsMode: ShortcutsMode) {
		if (shortcutsMode === this.graphData.shortcutsMode) {
			return;
		}

		const requiresReload = this.graphData.shortcutsMode === 'preserve' || shortcutsMode === 'preserve';
		this.graphData.shortcutsMode = shortcutsMode;
		if (requiresReload) {
			this.engine.setGraphData(this.graphData, false);
		}
	}

	private animate() {
		const doRedraw = !this.autoPauseRedraw || this.needsRedraw || this.engine.isEngineRunning();
		this.needsRedraw = false;

		// Update tooltip and trigger onHover events
		const object = this.isPointerDragging ? undefined : this.getObjectUnderPointer(); // Don't hover during drag
		if (object !== this.hoverObject) {
			if (!object || object.type === 'Node') {
				this.graphNotifier.setHoverNodeId(object?.object.id);
				this.graphNotifier.setTooltip(object?.object.tooltip);
			}

			const previousObject = this.hoverObject;

			if (previousObject && previousObject.type !== object?.type) {
				// Hover
				if (previousObject.type === 'Link') {
					this.onLinkHover?.(undefined, previousObject.object);
				} else {
					this.onNodeHover?.(undefined, previousObject.object);
				}
			}

			if (object) {
				// Hover in
				if (object.type === 'Link') {
					this.onLinkHover?.(object.object, previousObject?.type === 'Link' ? previousObject.object : undefined);
				} else {
					this.onNodeHover?.(object.object, previousObject?.type === 'Node' ? previousObject.object : undefined);
				}
			}

			this.hoverObject = object;
		}

		if (doRedraw) {
			this.engine.tickFrame?.();
			this.clearCanvas(this.shadowCtx);
			this.paintShadowCanvas();
			this.clearCanvas(this.ctx, this.backgroundColor);
			this.paintCanvas();
		}

		this.animationFrameRequestId = requestAnimationFrame(this.animate.bind(this));
	}

	private getObjectUnderPointer() {
		let object: SearchObject | undefined;
		const pxScale = this.devicePixelRatio;
		const px = (this.pointerPos.x > 0 && this.pointerPos.y > 0)
			? this.shadowCtx.getImageData(this.pointerPos.x * pxScale, this.pointerPos.y * pxScale, 1, 1)
			: undefined;
		if (px) {
			// Find object per pixel color
			object = this.graphData.lookup(px.data as any) ?? undefined;
		}

		return object;
	}

	private setLayoutOptions(graphLayout: GraphLayout) {
		const createLayoutEngine = graphLayout === 'none' ? () => new ForceEngine(this) : () => new ElkEngine(this, graphLayout);
		if (
			(graphLayout === 'none' && this.engine instanceof ForceEngine)
			|| (graphLayout !== 'none' && this.engine instanceof ElkEngine && this.engine.graphLayout === graphLayout)
		) {
			return;
		}

		const cls = graphLayout === 'none' ? ForceEngine : ElkEngine;
		if (this.engine === undefined || !(this.engine instanceof cls)) {
			this.engine = createLayoutEngine();
			this.engine.setGraphData(this.graphData);
			return;
		}

		if (this.engine instanceof ElkEngine && this.engine.graphLayout !== graphLayout) {
			this.engine.graphLayout = graphLayout as ElkDirection;
			this.engine.update();
		}
	}
}

const drawLinks = (
	links: Iterable<LinkObject>,
	ctx: CanvasContext,
	filter: ((links: LinkObject) => boolean) | undefined = undefined,
) => {
	ctx.beginPath();

	for (const link of links) {
		if (filter && !filter(link)) {
			continue;
		}

		if (link.sections) {
			ctx.moveTo(link.sections[0][0], link.sections[0][1]);
			for (let i = 1; i < link.sections.length; i++) {
				ctx.lineTo(link.sections[i][0], link.sections[i][1]);
			}
		} else {
			const source = link.source;
			const target = link.target;
			ctx.moveTo(source.x!, source.y!);
			ctx.lineTo(target.x!, target.y!);
		}
	}

	ctx.stroke();
};

const drawArrows = (
	links: Iterable<LinkObject>,
	arrowLength: number,
	ctx: CanvasContext,
	filter: ((links: LinkObject) => boolean) | undefined = undefined,
) => {
	for (const link of links) {
		if (filter && !filter(link)) {
			continue;
		}

		let start: Point;
		let end: Point;
		let endR: number;

		if (link.sections) {
			const p1 = link.sections[link.sections.length - 2];
			const p2 = link.sections[link.sections.length - 1];
			start = {x: p1[0], y: p1[1]};
			end = {x: p2[0], y: p2[1]};
			endR = 0;
		} else {
			start = {x: link.source.x!, y: link.source.y!};
			end = {x: link.target.x!, y: link.target.y!};
			endR = link.target.radius;
		}

		const arrowWhRatio = 1.6;
		const arrowVlenRatio = 0.2;

		const arrowHalfWidth = arrowLength / arrowWhRatio / 2;

		const getCoordsAlongLine = (t: number) => ({
			x: (start.x * (1 - t)) + (end.x * t),
			y: (start.y * (1 - t)) + (end.y * t),
		});

		const lineLength = Math.sqrt(((end.x - start.x) ** 2) + ((end.y - start.y) ** 2));
		const posAlongLine = lineLength - endR;
		const arrowHead = getCoordsAlongLine(posAlongLine / lineLength);
		const arrowTail = getCoordsAlongLine((posAlongLine - arrowLength) / lineLength);
		const arrowTailVertex = getCoordsAlongLine((posAlongLine - (arrowLength * (1 - arrowVlenRatio))) / lineLength);
		const cos = (arrowHead.y - arrowTail.y) / arrowLength;
		const sin = -(arrowHead.x - arrowTail.x) / arrowLength;

		ctx.beginPath();
		ctx.moveTo(arrowHead.x, arrowHead.y);
		ctx.lineTo(arrowTail.x + (arrowHalfWidth * cos), arrowTail.y + (arrowHalfWidth * sin));
		ctx.lineTo(arrowTailVertex.x, arrowTailVertex.y);
		ctx.lineTo(arrowTail.x - (arrowHalfWidth * cos), arrowTail.y - (arrowHalfWidth * sin));
		ctx.fill();
	}
};

const drawNodes = (nodes: Iterable<DrawNode>, ctx: CanvasContext) => {
	ctx.beginPath();
	for (const node of nodes) {
		if (node.shape === 'block') {
			ctx.rect(node.x, node.y, node.textWidth + 10, node.textHeight + 10);
		} else {
			ctx.moveTo(node.x + node.radius, node.y);
			ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
		}
	}

	ctx.stroke();
	ctx.fill();
};
