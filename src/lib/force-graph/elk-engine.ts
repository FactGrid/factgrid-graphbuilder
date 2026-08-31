import type {SparqlGraphData} from './graph-data';
import {ElkApi, type ElkNode} from './elk-api';
import {computeSimpleLayeredLayout} from './simple-layered-layout';
import type {ElkDirection, GraphEngineNotifier, LayoutEngine} from './types';

const elkGraphLayouts: Record<ElkDirection, string> = {
	down: 'DOWN',
	up: 'UP',
	right: 'RIGHT',
	left: 'LEFT',
};

export class ElkEngine implements LayoutEngine {
	private graphData: SparqlGraphData | undefined;

	private readonly api: ElkApi = new ElkApi();
	private updateTracker: symbol | undefined;

	constructor(private notifier: GraphEngineNotifier, public graphLayout: ElkDirection) {}

	public setGraphData(graphData: SparqlGraphData) {
		this.graphData = graphData;
		this.update();
	}

	public isEngineRunning() {
		return false;
	}

	public update() {
		const updateTracker = Symbol('elk-frame');
		this.updateTracker = updateTracker;

		const graphData = this.graphData!;

		if (graphData.isLargeGraph) {
			// ELK's layered algorithm uses deep recursion internally (e.g. node placement/compaction)
			// and reliably blows the JS call stack well before graphs this large. There's no option
			// short of a full rewrite of elkjs's algorithm that would make it safe at this scale, so
			// large graphs get a much simpler, non-recursive level-by-level placement instead — no
			// crossing-minimization or edge routing, but it always completes. Kept as labeled boxes
			// (not the force layout's unlabeled points) — the tree is static, so per-frame redraw
			// cost isn't the concern here that it is for the continuously-interacted force hairball.
			for (const node of graphData.nodes) {
				node.shape = 'block';
			}

			const bounds = computeSimpleLayeredLayout(graphData, this.graphLayout);
			this.notifier.onLayoutComplete(bounds.x, bounds.y, bounds.width, bounds.height);
			return;
		}

		for (const node of graphData.nodes) {
			node.shape = 'block';
		}

		const graph: ElkNode = {
			id: 'root',
			layoutOptions: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'elk.algorithm': 'layered',
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'elk.direction': elkGraphLayouts[this.graphLayout],
			},
			children: graphData.nodes.map(node => ({
				id: node.id,
				width: node.textWidth + 10,
				height: node.textHeight + 10,
			})),
			edges: graphData.forceLinks.map(link => ({
				id: link.id,
				sources: [link.source.id],
				targets: [link.target.id],
			})),
		};

		const startTime = performance.now();
		this.api.layout(graph).then(graph => {
			if (this.updateTracker === updateTracker) {
				const endTime = performance.now();
				console.log(`Call to layout took ${Math.round(endTime - startTime)} milliseconds`, graph);

				for (const [index, node] of graphData.nodes.entries()) {
					node.x = graph.children![index].x!;
					node.y = graph.children![index].y!;
				}

				for (const [index, link] of graphData.forceLinks.entries()) {
					const edge = graph.edges![index];
					const section = edge.sections![0];
					link.sections = [[section.startPoint.x, section.startPoint.y]];
					if (section.bendPoints) {
						for (const point of section.bendPoints) {
							link.sections.push([point.x, point.y]);
						}
					}

					link.sections.push([section.endPoint.x, section.endPoint.y]);
				}

				this.notifier.onLayoutComplete(0, 0, graph.width!, graph.height!);
			} else {
				console.log('throwing away results of elk as unneeded');
			}
		}).catch((error: unknown) => {
			console.error(error);
			if (this.updateTracker === updateTracker) {
				this.notifier.onLayoutError('Hierarchical layout failed for this graph — try the default (force-directed) layout instead.');
			}
		});
	}
}

