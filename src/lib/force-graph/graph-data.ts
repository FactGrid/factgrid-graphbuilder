import {scaleLinear} from 'd3-scale';
import escape from 'lodash.escape';
import ColorTracker from 'canvas-color-tracker';
import type {Canvas, CanvasContext, LinkObject, NodeObject, SearchObject, ShortcutsMode} from './types';
import {QueryService, type QueryResponseBinding} from '$lib/query-service';

// Shortcut detection is O(links) once memoized, but for very large graphs even that (plus the
// unavoidable memory for cached reachable-sets) is wasted work for a feature few users rely on —
// so above this many links it's deferred until a user explicitly requests it (see computeShortcuts).
const AUTO_SHORTCUT_LINK_LIMIT = 3_000;

// Safety net for computeShortcuts() itself (whether run automatically or on demand): caps total
// reachable-set traversal steps so an unusually dense large graph can't block the tab indefinitely.
const SHORTCUT_DETECTION_VISIT_BUDGET = 2_000_000;

// How many links to process between yielding to the event loop, so progress can be reported and
// the UI stays responsive during a large on-demand shortcut detection run.
const SHORTCUT_BATCH_SIZE = 500;

class TextMeasurer {
	canvas: Canvas;
	context: CanvasContext;
	constructor() {
		this.canvas = (typeof OffscreenCanvas === 'undefined') ? new HTMLCanvasElement() : new OffscreenCanvas(0, 0);
		this.context = this.canvas.getContext('2d', {alpha: false})! as CanvasContext;
		this.context.font = '10px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';
	}

	getTextWidth(text: string) {
		return this.context.measureText(text).width;
	}
}

export class SparqlGraphData {
	public nodes: NodeObject[];
	public shortcutsMode: ShortcutsMode = 'preserve';

	// True until a full (unbudgeted) shortcut-detection pass over the current links has completed —
	// large graphs start (and can remain) in this state until computeShortcuts() is run on demand.
	public shortcutDetectionSkipped = false;

	// Set once per load based on link count and never cleared by computeShortcuts() completing —
	// unlike shortcutDetectionSkipped, this stays true for the whole session so hover/click
	// interaction mode (see GraphEngine) doesn't flip back to the continuous-hover behavior just
	// because the user finished an on-demand shortcut detection run on an otherwise-still-huge graph.
	public isLargeGraph = false;

	// Spanning-tree parent per node, set by computeSimpleLayeredLayout when the hierarchical layout
	// is active (undefined otherwise, e.g. force-directed) — lets the "show path to root" feature
	// walk straight up to a root without recomputing anything.
	public treeParent: Map<NodeObject, NodeObject> | undefined = undefined;

	private readonly measurer = new TextMeasurer();

	public get forceLinks(): LinkObject[] {
		return this.shortcutsMode === 'preserve' ? this.allLinks : this.noShortcutLinks;
	}

	public get viewLinks(): LinkObject[] {
		return this.shortcutsMode === 'remove' ? this.noShortcutLinks : this.allLinks;
	}

	private allLinks: LinkObject[];
	private noShortcutLinks: LinkObject[];
	private colorTracker: ColorTracker = new ColorTracker();

	constructor(
		public linksSet: Set<LinkObject> = new Set(),
		public nodesMap: Map<string, NodeObject> = new Map(),
		public rootNode: NodeObject | undefined = undefined) {
		this.nodes = [...nodesMap.values()];
		this.allLinks = [];
		this.noShortcutLinks = [];
		this.refreshLinkViews();
	}

	public lookup(color: Uint8ClampedArray) {
		return this.colorTracker.lookup(color as any) as SearchObject ?? undefined;
	}

	private refreshLinkViews() {
		const links = [...this.linksSet];
		this.allLinks = links;
		this.noShortcutLinks = links.filter(({isShortcut}) => !isShortcut);
	}

	public async loadFromSparql(query: string, rootNodeId: string | undefined, abortSignal: AbortSignal) {
		const queryService = QueryService.getInstance();
		const lines = await queryService.get(query, {signal: abortSignal});

		let minSize = Number.POSITIVE_INFINITY;
		let maxSize = 0;

		const nodesMap = new Map<string, NodeObject>();
		let rootNode;
		const defaultRadius = 5;

		this.colorTracker = new ColorTracker();
		this.treeParent = undefined;

		for (const line of lines) {
			const itemId = line.item.value!;

			if (nodesMap.has(itemId)) {
				continue;
			}

			const size = line.size === undefined ? undefined : Number.parseFloat(line.size.value!);
			if (size !== undefined && size < minSize) {
				minSize = size;
			}

			if (size !== undefined && size > maxSize) {
				maxSize = size;
			}

			const label = itemLabel(line);

			const node: NodeObject = {
				id: itemId,
				label,
				tooltip: itemTooltip(label, size),
				url: itemId,
				size,
				radius: defaultRadius,
				edgesIn: [],
				edgesOut: [],
				textHeight: 10,
				textWidth: this.measurer.getTextWidth(label),
				indexColor: '',
				shape: 'point',
			};
			node.indexColor = this.colorTracker.register({type: 'Node', object: node} as SearchObject)!;

			if (rootNodeId !== undefined && itemId.endsWith(rootNodeId)) {
				rootNode = node;
			}

			nodesMap.set(itemId, node);
		}

		const scaler = scaleLinear().domain([minSize, maxSize]).range([3, 20]);
		for (const node of nodesMap.values()) {
			node.radius = node.size === undefined ? defaultRadius : scaler(node.size);
		}

		const linksSet = new Set<LinkObject>();

		for (const line of lines) {
			const sourceId = line.item?.value;
			const targetId = line.linkTo?.value;

			if (!sourceId || !nodesMap.has(sourceId) || !targetId || !nodesMap.has(targetId)) {
				continue;
			}

			const link: LinkObject = {
				id: sourceId + '-' + targetId,
				source: nodesMap.get(sourceId)!,
				target: nodesMap.get(targetId)!,
				isShortcut: false,
				indexColor: '',
			};
			link.indexColor = this.colorTracker.register({type: 'Link', object: link} as SearchObject)!;

			if (linksSet.has(link)) {
				continue;
			}

			nodesMap.get(targetId)!.edgesIn.push(link);
			nodesMap.get(sourceId)!.edgesOut.push(link);
			linksSet.add(link);
		}

		this.linksSet = linksSet;
		this.nodesMap = nodesMap;
		this.rootNode = rootNode;
		this.nodes = [...nodesMap.values()];
		this.isLargeGraph = linksSet.size > AUTO_SHORTCUT_LINK_LIMIT;

		if (this.isLargeGraph) {
			// Deferred: shortcut detection is rarely used and not worth the cost on large graphs
			// unless a user actually asks for it — see computeShortcuts().
			this.shortcutDetectionSkipped = true;
			this.refreshLinkViews();
			return;
		}

		await this.computeShortcuts(undefined, abortSignal);
	}

	// Marks links whose endpoints are already connected by some other, longer path as `isShortcut`.
	// Reachable-sets are memoized per node (rather than re-walked per link, per first-level neighbor,
	// as a naive implementation would) so a node shared by many links' first-level neighborhoods is
	// only traversed once. A global visit budget still bounds worst-case cost for unusually dense
	// graphs, and progress is reported in batches so large on-demand runs don't block the UI thread.
	public async computeShortcuts(
		onProgress?: (processed: number, total: number) => void,
		abortSignal?: AbortSignal,
	): Promise<void> {
		const links = [...this.linksSet];
		const total = links.length;

		const reachableCache = new Map<NodeObject, Set<NodeObject>>();
		let visitBudget = SHORTCUT_DETECTION_VISIT_BUDGET;

		// Reachable set from `start`, excluding `start` itself even if a cycle leads back to it —
		// this matches what the per-edge traversal below needs: "is target reachable via >=1 hops".
		const getReachableSet = (start: NodeObject): Set<NodeObject> | undefined => {
			const cached = reachableCache.get(start);
			if (cached) {
				return cached;
			}

			const visited = new Set<NodeObject>([start]);
			const reachable = new Set<NodeObject>();
			const stack = [start];

			while (stack.length > 0) {
				const current = stack.pop()!;
				for (const edge of current.edgesOut) {
					const child = edge.target;
					if (visited.has(child)) {
						continue;
					}

					visited.add(child);
					reachable.add(child);
					stack.push(child);

					if (--visitBudget <= 0) {
						return undefined;
					}
				}
			}

			reachableCache.set(start, reachable);
			return reachable;
		};

		let processed = 0;
		let budgetExceeded = false;

		for (const link of links) {
			if (abortSignal?.aborted) {
				return;
			}

			let isShortcut = false;
			for (const edge of link.source.edgesOut) {
				const reachable = getReachableSet(edge.target);
				if (reachable === undefined) {
					budgetExceeded = true;
					break;
				}

				if (reachable.has(link.target)) {
					isShortcut = true;
					break;
				}
			}

			if (budgetExceeded) {
				break;
			}

			link.isShortcut = isShortcut;
			processed++;

			if (processed % SHORTCUT_BATCH_SIZE === 0) {
				onProgress?.(processed, total);
				await new Promise(resolve => {
					setTimeout(resolve, 0);
				});
			}
		}

		this.refreshLinkViews();
		this.shortcutDetectionSkipped = budgetExceeded;
		onProgress?.(processed, total);
	}

	public getConnectedNodes(source: NodeObject, direction: 'forward' | 'reverse') {
		let getChildrenLinks;
		if (this.shortcutsMode === 'remove') {
			getChildrenLinks = direction === 'forward'
				? (node: NodeObject) => node.edgesOut.filter(x => !x.isShortcut)
				: (node: NodeObject) => node.edgesIn.filter(x => !x.isShortcut);
		} else {
			getChildrenLinks = direction === 'forward'
				? (node: NodeObject) => node.edgesOut
				: (node: NodeObject) => node.edgesIn;
		}

		const getEdgeTarget = direction === 'forward' ? (edge: LinkObject) => edge.target : (edge: LinkObject) => edge.source;

		const childrenNodes = new Set<NodeObject>();
		const childrenLinks = new Set<LinkObject>();
		const stack = [this.nodesMap.get(source.id)!];

		while (stack.length > 0) {
			const current = stack.pop()!;
			childrenNodes.add(current);

			const currentChildrenLinks = getChildrenLinks(current);
			for (const link of currentChildrenLinks) {
				childrenLinks.add(link);
			}

			// eslint-disable-next-line unicorn/no-array-callback-reference
			const currentChildrenNodes = currentChildrenLinks.map(getEdgeTarget);
			const next = [...currentChildrenNodes].filter(child => !childrenNodes.has(child));
			stack.push(...next);
		}

		childrenNodes.delete(source);

		return {childrenNodes, childrenLinks};
	}
}

const itemTooltip = (label: string, size: number | undefined = undefined) => {
	label = escape(label);

	if (size !== undefined) {
		label += `<br>(${size})`;
	}

	return label;
};

const itemLabel = (element: QueryResponseBinding) => element.itemLabel?.value
					?? /^https:\/\/database.factgrid.de\/entity\/(.+)$/.exec(element.item.value!)?.[1]
					?? element.item.value!;
