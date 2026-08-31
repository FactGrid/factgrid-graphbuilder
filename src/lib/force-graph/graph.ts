import {zoom as d3Zoom, zoomIdentity, zoomTransform as d3ZoomTransform, type D3ZoomEvent} from 'd3-zoom';
import {select as d3Select, type Selection} from 'd3-selection';
import {drag as d3Drag, type D3DragEvent} from 'd3-drag';
import {writable} from 'svelte/store';
import type {GraphEngineNotifier, GraphExportPayload, GraphNotifier, GraphState, NodeContextMenuInfo, Point, SearchResult, ShortcutStatus, VisParameters} from './types';

const zoom2NodesFactor = 4;

export class Graph implements GraphNotifier {
	public static async create(canvas: HTMLCanvasElement, visParameters: VisParameters) {
		const useOffscreenCanvas = Boolean(HTMLCanvasElement.prototype.transferControlToOffscreen);

		if (!useOffscreenCanvas) {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			const {GraphEngine} = await import('$lib/force-graph/graph-engine');
			const createCanvasNotifier = (self: GraphNotifier) => new GraphEngine(canvas, visParameters, self);
			return new Graph(canvas, createCanvasNotifier);
		}

		// eslint-disable-next-line @typescript-eslint/naming-convention
		const {default: GraphEngineWorker} = await import('$lib/force-graph/graph-engine.worker?worker');

		const createCanvasNotifier = (self: GraphNotifier) => {
			const worker = new GraphEngineWorker();

			worker.addEventListener('message', event => {
				const [method, ...args] = event.data;
				const f = (self as any)[method] as (...args: any) => void;
				f.bind(self)(...args);
			});

			const shadowCanvas = canvas.transferControlToOffscreen();
			worker.postMessage(['init', shadowCanvas, visParameters], [shadowCanvas]);

			const proxy = new Proxy<GraphEngineNotifier>({} as unknown as GraphEngineNotifier, {
				get(_target, prop, _receiver) {
					return (...args: any) => {
						if (prop === 'destroy') {
							worker.terminate();
							return;
						}

						worker.postMessage([prop, ...args]);
					};
				},
			});

			return proxy;
		};

		return new Graph(canvas, createCanvasNotifier);
	}

	readonly tooltip = writable<string | undefined>();
	readonly isHover = writable<boolean>(false);
	readonly state = writable<GraphState>('ok');
	readonly error = writable<string | undefined>();
	readonly isDragging = writable<boolean>(false);
	readonly pointerPos = writable<Point>({x: -1e12, y: -1e12});
	readonly shortcutStatus = writable<ShortcutStatus>({skipped: false});
	readonly contextMenu = writable<NodeContextMenuInfo | undefined>();
	readonly pinnedNodeId = writable<string | undefined>();
	readonly isolatedConnectionsLabel = writable<string | undefined>();
	readonly searchResults = writable<SearchResult[]>([]);

	private readonly resizeObserver: ResizeObserver;

	private width = 0;
	private height = 0;

	private readonly zoomBehavior = d3Zoom<HTMLCanvasElement, unknown>();
	private readonly graphEngine: GraphEngineNotifier;

	// eslint-disable-next-line @typescript-eslint/ban-types
	private readonly d3Canvas: Selection<HTMLCanvasElement, unknown, null, undefined>;
	private hoverNodeId: string | undefined;
	private draggable = true;

	private readonly pendingExports = new Map<string, {
		resolve: (payload: GraphExportPayload) => void;
		reject: (error: Error) => void;
	}>();

	private constructor(private readonly canvas: HTMLCanvasElement, createCanvasNotifier: (self: GraphNotifier) => GraphEngineNotifier) {
		this.graphEngine = createCanvasNotifier(this);

		let pointerPos = {x: -1e12, y: -1e12};

		this.d3Canvas = d3Select(this.canvas);

		this.zoomBehavior
			.on('zoom', (ev: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
				this.graphEngine.onZoomTransform({x: ev.transform.x, y: ev.transform.y, k: ev.transform.k});
			})
			.on('end', (_ev: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
				this.graphEngine.onZoomTransformEnd();
			});

		const dragSubject = () => this.draggable ? this.hoverNodeId : undefined;

		const onDragStart = (ev: D3DragEvent<HTMLCanvasElement, unknown, string>) => {
			this.isDragging.set(true);
			const nodeId = ev.subject;
			this.graphEngine.onDragStart(nodeId, ev.active);
		};

		const onDrag = (ev: D3DragEvent<HTMLCanvasElement, unknown, string>) => {
			const nodeId = ev.subject;
			const [x, y] = d3ZoomTransform(this.canvas).invert([ev.x, ev.y]);
			this.graphEngine.onDrag(nodeId, {x, y});
		};

		const onDragEnd = (ev: D3DragEvent<HTMLCanvasElement, unknown, string>) => {
			const nodeId = ev.subject;
			this.isDragging.set(false);
			this.graphEngine.onDragEnd(nodeId);
		};

		const dragBehavior = d3Drag<HTMLCanvasElement, unknown>().subject(dragSubject).on('start', onDragStart).on('drag', onDrag).on('end', onDragEnd);

		this.d3Canvas.call(dragBehavior).call(this.zoomBehavior);

		this.resizeObserver = new ResizeObserver(() => {
			this.adjustCanvasSize();
		});

		this.resizeObserver.observe(canvas);
		this.adjustCanvasSize();

		// Capture pointer coords on move or touchstart
		const listener = (ev: PointerEvent) => {
			if (ev.type === 'pointerdown') {
				this.graphEngine.onPointerDown();
			}

			const rect = canvas.getBoundingClientRect();
			const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
			const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
			const offset = {top: rect.top + scrollTop, left: rect.left + scrollLeft};
			pointerPos = {x: ev.pageX - offset.left, y: ev.pageY - offset.top};
			this.pointerPos.set(pointerPos);
			this.graphEngine.setPointerPos(pointerPos);
		};

		canvas.addEventListener('pointermove', listener, {passive: true});
		canvas.addEventListener('pointerdown', listener, {passive: true});

		// Handle click/touch events on nodes/links
		canvas.addEventListener('pointerup', ev => {
			this.graphEngine.onPointerUp(ev.button);
		}, {passive: true});
	}

	public load(query: string, rootNode: string | undefined) {
		void this.graphEngine.load(query, rootNode);
	}

	public computeShortcuts() {
		void this.graphEngine.computeShortcuts();
	}

	public setPinnedNode(nodeId: string | undefined) {
		this.pinnedNodeId.set(nodeId);
		this.graphEngine.setPinnedNode(nodeId);
	}

	public setIsolatedConnections(nodeId: string | undefined) {
		this.graphEngine.setIsolatedConnections(nodeId);
	}

	public zoomToFit() {
		this.graphEngine.zoomToFit();
	}

	public zoomToRoot() {
		this.graphEngine.zoomToRoot();
	}

	public zoomToNode(nodeId: string) {
		this.graphEngine.zoomToNode(nodeId);
	}

	public searchNodes(query: string) {
		this.graphEngine.searchNodes(query);
	}

	public setVisParameters(visParameters: VisParameters) {
		this.draggable = visParameters.graphDirection === 'none';

		this.graphEngine.setVisParameters(visParameters);
	}

	public setTheme(theme: 'light' | 'dark') {
		this.graphEngine.setTheme(theme);
	}

	public destroy() {
		this.resizeObserver.unobserve(this.canvas);
		this.graphEngine.destroy();
	}

	public setTooltip(tooltip: string | undefined) {
		this.tooltip.set(tooltip);
	}

	public setHoverNodeId(nodeId: string | undefined) {
		this.hoverNodeId = nodeId;
		this.isHover.set(nodeId !== undefined);
	}

	public onNodeClicked(url: string) {
		window.open(url, '_blank');
	}

	public onNodeContextMenu(info: NodeContextMenuInfo) {
		this.contextMenu.set(info);
	}

	public setShortcutStatus(status: ShortcutStatus) {
		this.shortcutStatus.set(status);
	}

	public setIsolatedConnectionsLabel(label: string | undefined) {
		this.isolatedConnectionsLabel.set(label);
	}

	public setSearchResults(results: SearchResult[]) {
		this.searchResults.set(results);
	}

	// Shared by onLayoutComplete (a layout/reload just finished — jump instantly, an animated pan
	// right as the graph first appears would just be extra motion to wait through) and zoomToBounds
	// (a deliberate user navigation action — house/crosshair/search-result buttons — where a smooth
	// transition helps keep track of where the view moved to). Animates by hand (plain RAF tween)
	// rather than pulling in d3-transition just for this one call site.
	private applyZoomToBounds(x: number, y: number, width: number, height: number, animate: boolean) {
		const zoomK = Math.max(1e-12, Math.min(1e12,
			this.canvas.width / width,
			this.canvas.height / height,
		)) / window.devicePixelRatio;

		const cssWidth = this.canvas.width / window.devicePixelRatio;
		const cssHeight = this.canvas.height / window.devicePixelRatio;
		const centerX = x + (width / 2);
		const centerY = y + (height / 2);
		const targetTransform = zoomIdentity
			.translate((cssWidth / 2) - (centerX * zoomK), (cssHeight / 2) - (centerY * zoomK))
			.scale(zoomK);

		if (!animate) {
			this.zoomBehavior.transform(this.d3Canvas, targetTransform);
			this.graphEngine.requestRedraw();
			return;
		}

		const start = d3ZoomTransform(this.canvas);
		const duration = 400;
		const startTime = performance.now();

		const step = (now: number) => {
			const t = Math.min(1, (now - startTime) / duration);
			const eased = 1 - ((1 - t) ** 3); // Ease-out cubic
			this.zoomBehavior.transform(this.d3Canvas, zoomIdentity
				.translate(
					start.x + ((targetTransform.x - start.x) * eased),
					start.y + ((targetTransform.y - start.y) * eased),
				)
				.scale(start.k + ((targetTransform.k - start.k) * eased)));

			if (t < 1) {
				requestAnimationFrame(step);
			}
		};

		requestAnimationFrame(step);
	}

	public onLayoutComplete(x: number, y: number, width: number, height: number) {
		this.applyZoomToBounds(x, y, width, height, false);
	}

	public zoomToBounds(x: number, y: number, width: number, height: number) {
		this.applyZoomToBounds(x, y, width, height, true);
	}

	public setState(state: GraphState): void {
		this.state.set(state);
	}

	public setError(error: string | undefined): void {
		this.error.set(error);
	}

	public async requestExportData(): Promise<GraphExportPayload> {
		const requestId = Math.random().toString(36).slice(2);

		return new Promise<GraphExportPayload>((resolve, reject) => {
			const timeoutId = window.setTimeout(() => {
				this.pendingExports.delete(requestId);
				reject(new Error('Timed out waiting for graph export data'));
			}, 10_000);

			this.pendingExports.set(requestId, {
				resolve: payload => {
					window.clearTimeout(timeoutId);
					resolve(payload);
				},
				reject: error => {
					window.clearTimeout(timeoutId);
					reject(error);
				},
			});

			this.graphEngine.exportGraph(requestId);
		});
	}

	public onGraphExportReady(requestId: string, payload: GraphExportPayload) {
		const pending = this.pendingExports.get(requestId);
		if (!pending) {
			return;
		}

		this.pendingExports.delete(requestId);
		pending.resolve(payload);
	}

	private adjustCanvasSize() {
		const oldWidth = this.width;
		const oldHeight = this.height;

		this.width = this.canvas.clientWidth;
		this.height = this.canvas.clientHeight;

		this.graphEngine.adjustCanvasSize(this.canvas.clientWidth, this.canvas.clientHeight, window.devicePixelRatio);

		// Relative center panning based on 0,0
		const k = d3ZoomTransform(this.canvas).k;
		this.zoomBehavior.translateBy(this.d3Canvas,
			(this.width - oldWidth) / 2 / k,
			(this.height - oldHeight) / 2 / k,
		);

		this.graphEngine.requestRedraw();
	}
}
