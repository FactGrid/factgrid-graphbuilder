
type Canvas = OffscreenCanvas | HTMLCanvasElement;
type CanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type GraphEngineNotifier = {
	load(query: string, rootNode: string | undefined): Promise<void>;
	requestRedraw(): void;
	adjustCanvasSize(width: number, height: number, devicePixelRatio: number): void;
	onZoomTransform(transform: {x: number; y: number; k: number}): void;
	onZoomTransformEnd(): void;
	onDragStart(nodeId: string, active: number): void;
	onDrag(nodeId: string, dragPos: Point): void;
	onDragEnd(nodeId: string): void;
	onPointerDown(): void;
	setPointerPos(point: Point): void;
	onPointerUp(button: number): void;
	destroy(): void;
	setVisParameters(visParameters: VisParameters): void;
	setTheme(theme: 'light' | 'dark'): void;
	onLayoutComplete(x: number, y: number, width: number, height: number): void;
	onLayoutError(message: string): void;
	exportGraph(requestId: string): void;
	setPinnedNode(nodeId: string | undefined): void;
	computeShortcuts(): void;
	setIsolatedConnections(nodeId: string | undefined): void;
};

export type GraphState = 'loading' | 'ok' | 'error';

export type ShortcutStatus = {
	skipped: boolean;
	progress?: {processed: number; total: number};
};

export type NodeContextMenuInfo = {
	nodeId: string;
	url: string;
	label: string;
	pos: Point;
	canIsolateConnections: boolean;
};

export type GraphNotifier = {
	setTooltip(contents: string | undefined): void;
	setHoverNodeId(nodeId: string | undefined): void;
	onLayoutComplete(x: number, y: number, width: number, height: number): void;
	setState(state: GraphState): void;
	setError(error: string | undefined): void;
	onNodeClicked(url: string): void;
	onGraphExportReady(requestId: string, payload: GraphExportPayload): void;
	onNodeContextMenu(info: NodeContextMenuInfo): void;
	setShortcutStatus(status: ShortcutStatus): void;
	setIsolatedConnectionsLabel(label: string | undefined): void;
};

export type GraphExportBounds = {x: number; y: number; width: number; height: number};

export type GraphExportNode = {
	x: number;
	y: number;
	radius: number;
	textWidth: number;
	textHeight: number;
	label: string;
	isRoot: boolean;
};

export type GraphExportLink = {
	sections?: Array<[number, number]>;
	source: {x: number; y: number; radius: number};
	target: {x: number; y: number; radius: number};
	isShortcut: boolean;
};

export type GraphExportPayload = {
	bounds: GraphExportBounds;
	isPointShape: boolean;
	shortcutsColor: string;
	shortcutsWidth: number;
	showLabels: boolean;
	nodes: GraphExportNode[];
	links: GraphExportLink[];
};

export type NodeObject = {
	id: string;
	label: string;
	tooltip: string;
	url: string;
	size?: number;
	edgesIn: LinkObject[];
	edgesOut: LinkObject[];
	radius: number;

	textWidth: number;
	textHeight: number;
	shape: NodeShape;

	x?: number;
	y?: number;
	indexColor: string;
};

export type LinkObject = {
	id: string;
	source: NodeObject;
	target: NodeObject;
	isShortcut: boolean;
	label?: string;
	sections?: Array<[number, number]>;
	indexColor: string;
};

export type NodeShape = 'block' | 'point';

export type LayoutEngine = {
	setGraphData(graphData: GraphData, replace: boolean = true): void;
	onDrag?(): void;
	onDragEnd?(): void;
	isEngineRunning(): boolean;
	tickFrame?(): void;
};

export type Point = {x: number; y: number};

export type ShortcutsMode = 'preserve' | 'remove' | 'relax';

export type SearchObject = {type: 'Link'; object: LinkObject} | {type: 'Node'; object: NodeObject};

export type GraphData = {
	public nodes: NodeObject[];
	public shortcutsMode: ShortcutsMode = 'preserve';

	get forceLinks(): LinkObject[];
	get viewLinks(): LinkObject[];

	lookup(color: Uint8ClampedArray): SearchObject;
	getConnectedNodes(source: NodeObject, direction: 'forward' | 'reverse'): {
		childrenNodes: Set<NodeObject>;
		childrenLinks: Set<LinkObject>;
	};
};

export type ElkDirection = 'down' | 'up' | 'right' | 'left';
export type GraphLayout = 'none' | ElkDirection;

export type VisParameters = {
	shortcutsMode: ShortcutsMode;
	shortcutsColor: string;
	shortcutsWidth: number;
	graphDirection: GraphLayout;
	showLabels: boolean;
};
