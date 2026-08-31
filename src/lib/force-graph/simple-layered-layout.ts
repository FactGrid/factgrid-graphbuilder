import type {SparqlGraphData} from './graph-data';
import type {ElkDirection, NodeObject} from './types';

const horizontalGap = 20;
const verticalSpacing = 80;

// Real ELK positions block-shape nodes by their top-left corner, sized textWidth+10 x
// textHeight+10 (see elk-engine.ts's non-large-graph path) — matched here so labels aren't
// squeezed into less space than they need.
const ownWidth = (node: NodeObject) => node.textWidth + 10;

type TreeShape = {
	depthOf: Map<NodeObject, number>;
	children: Map<NodeObject, NodeObject[]>;
	bfsOrder: NodeObject[];
};

// Each node's required horizontal slot width, in pixels — either its own label width (a leaf, or a
// node wider than its children combined) or the sum of its children's slot widths, whichever is
// larger. bfsOrder is non-decreasing in depth, so scanning it in reverse guarantees every child is
// processed before its parent — the dependency a recursive post-order traversal would normally
// provide.
const computeSlotWidths = (shape: TreeShape): Map<NodeObject, number> => {
	const slotWidth = new Map<NodeObject, number>();
	for (let i = shape.bfsOrder.length - 1; i >= 0; i--) {
		const node = shape.bfsOrder[i];
		const kids = shape.children.get(node);
		if (!kids || kids.length === 0) {
			slotWidth.set(node, ownWidth(node) + horizontalGap);
			continue;
		}

		let childrenWidth = 0;
		for (const kid of kids) {
			childrenWidth += slotWidth.get(kid)!;
		}

		slotWidth.set(node, Math.max(ownWidth(node) + horizontalGap, childrenWidth));
	}

	return slotWidth;
};

// Top-down: forward bfsOrder has every parent before its children, so each node's slot start
// (pixel offset) is known before its children need theirs.
const assignSlotStarts = (shape: TreeShape, slotWidth: Map<NodeObject, number>, roots: NodeObject[]): Map<NodeObject, number> => {
	const slotStart = new Map<NodeObject, number>();
	let rootCursor = 0;
	for (const root of roots) {
		slotStart.set(root, rootCursor);
		rootCursor += slotWidth.get(root)!;
	}

	for (const node of shape.bfsOrder) {
		const kids = shape.children.get(node);
		if (!kids) {
			continue;
		}

		let childCursor = slotStart.get(node)!;
		for (const kid of kids) {
			slotStart.set(kid, childCursor);
			childCursor += slotWidth.get(kid)!;
		}
	}

	return slotStart;
};

// A plain, iterative tree layout used in place of ElkEngine for graphs too large for elkjs's
// recursive "layered" algorithm (which reliably overflows the JS call stack well before tens of
// thousands of nodes — see elk-engine.ts). It computes an actual tree shape — not a cosmetic
// approximation — using the classic subtree-width method: each node's required horizontal space
// is the sum of its children's (or its own label width, whichever is larger), computed bottom-up,
// then children are centered under their parent top-down. Both passes are O(V+E) and use the
// existing BFS discovery order instead of recursion, so there's no stack-depth limit regardless of
// graph size. A wide tree can end up very wide in absolute terms — that's expected and correct
// (the alternative is distorting the hierarchy to fit a target aspect ratio); zooming in and
// exporting are how you inspect a tree this large, not an auto-shrunk overview. Edges beyond the
// spanning tree (extra parents from cycles/DAG merges) are still drawn as plain lines between
// wherever their endpoints ended up.
export const computeSimpleLayeredLayout = (graphData: SparqlGraphData, direction: ElkDirection) => {
	const nodes = graphData.nodes;
	const depthOf = new Map<NodeObject, number>();
	const children = new Map<NodeObject, NodeObject[]>();
	const bfsOrder: NodeObject[] = [];
	const roots: NodeObject[] = [];

	for (const node of nodes) {
		if (node.edgesIn.length === 0) {
			depthOf.set(node, 0);
			roots.push(node);
			bfsOrder.push(node);
		}
	}

	let cursor = 0;
	let nextUnseeded = 0;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		while (cursor < bfsOrder.length) {
			const current = bfsOrder[cursor++];
			const depth = depthOf.get(current)!;
			for (const edge of current.edgesOut) {
				const target = edge.target;
				if (!depthOf.has(target)) {
					depthOf.set(target, depth + 1);
					bfsOrder.push(target);
					let kids = children.get(current);
					if (!kids) {
						kids = [];
						children.set(current, kids);
					}

					kids.push(target);
				}
			}
		}

		// Every node reachable from an in-degree-0 "root" now has a depth. Anything left over
		// belongs to a cyclic component with no natural entry point — seed one arbitrary node
		// from it as another root and keep going until every node has been placed.
		while (nextUnseeded < nodes.length && depthOf.has(nodes[nextUnseeded])) {
			nextUnseeded++;
		}

		if (nextUnseeded >= nodes.length) {
			break;
		}

		const node = nodes[nextUnseeded];
		depthOf.set(node, 0);
		roots.push(node);
		bfsOrder.push(node);
	}

	const shape: TreeShape = {depthOf, children, bfsOrder};
	const slotWidth = computeSlotWidths(shape);
	const slotStart = assignSlotStarts(shape, slotWidth, roots);

	for (const node of nodes) {
		// Center the node's own box within its (possibly wider, if it has many descendants) slot.
		const along = slotStart.get(node)! + ((slotWidth.get(node)! - ownWidth(node)) / 2);
		const across = depthOf.get(node)! * verticalSpacing;
		switch (direction) {
			case 'down': {
				node.x = along;
				node.y = across;
				break;
			}

			case 'up': {
				node.x = along;
				node.y = -across;
				break;
			}

			case 'right': {
				node.x = across;
				node.y = along;
				break;
			}

			case 'left': {
				node.x = -across;
				node.y = along;
				break;
			}
		}
	}

	// Invert the spanning-tree children map into a parent lookup, kept for callers that need to
	// walk toward a root without recomputing anything.
	const treeParent = new Map<NodeObject, NodeObject>();
	for (const [parent, kids] of children) {
		for (const kid of kids) {
			treeParent.set(kid, parent);
		}
	}

	graphData.treeParent = treeParent;

	if (nodes.length === 0) {
		return {x: 0, y: 0, width: 100, height: 100};
	}

	// The tree can be legitimately enormous in one dimension (a flat, bushy hierarchy can be
	// thousands of pixels wide while only a handful of levels deep) — fitting that whole extent
	// into the viewport would force a single uniform zoom factor so small that the *other*
	// dimension collapses to a sub-pixel sliver too, making the entire canvas look blank even
	// though the layout itself is correct. So the initial view is a fixed-size window anchored on
	// the primary root instead of the full extent: enough to see the first several levels at a
	// readable scale. The rest of the tree is still fully laid out and reachable by panning/zooming
	// out, and the SVG/PDF export (computeExportBounds in graph-engine.ts) covers the true full
	// extent regardless of this initial viewport choice.
	const initialViewBreadth = 600;
	const initialViewDepth = verticalSpacing * 5;
	const root = roots[0];
	const rootX = root.x!;
	const rootY = root.y!;

	let x: number;
	let y: number;
	let width: number;
	let height: number;
	switch (direction) {
		case 'down': {
			x = rootX - (initialViewBreadth / 2);
			y = rootY;
			width = initialViewBreadth;
			height = initialViewDepth;
			break;
		}

		case 'up': {
			x = rootX - (initialViewBreadth / 2);
			y = rootY - initialViewDepth;
			width = initialViewBreadth;
			height = initialViewDepth;
			break;
		}

		case 'right': {
			x = rootX;
			y = rootY - (initialViewBreadth / 2);
			width = initialViewDepth;
			height = initialViewBreadth;
			break;
		}

		case 'left': {
			x = rootX - initialViewDepth;
			y = rootY - (initialViewBreadth / 2);
			width = initialViewDepth;
			height = initialViewBreadth;
			break;
		}
	}

	return {x, y, width, height};
};

// Shared BFS-based tree-shape builder for layoutConnectedSubgraph below: given one starting node
// and a way to get a node's children restricted to an allowed set, returns per-node depth, a
// children map, and discovery order. Safe to use a single-seed BFS here (unlike the full-graph
// layout above, which needs multi-root/cyclic-component handling) because `allowed` is always
// exactly the reachable set already computed by getConnectedNodes — every node in it is guaranteed
// reachable from the one starting node via edges restricted to that same set.
const buildTreeShape = (
	start: NodeObject,
	getChildren: (node: NodeObject) => NodeObject[],
	allowed: Set<NodeObject>,
): TreeShape => {
	const depthOf = new Map<NodeObject, number>([[start, 0]]);
	const children = new Map<NodeObject, NodeObject[]>();
	const bfsOrder: NodeObject[] = [start];

	let cursor = 0;
	while (cursor < bfsOrder.length) {
		const current = bfsOrder[cursor++];
		const depth = depthOf.get(current)!;
		for (const next of getChildren(current)) {
			if (!allowed.has(next) || depthOf.has(next)) {
				continue;
			}

			depthOf.set(next, depth + 1);
			bfsOrder.push(next);
			let kids = children.get(current);
			if (!kids) {
				kids = [];
				children.set(current, kids);
			}

			kids.push(next);
		}
	}

	return {depthOf, children, bfsOrder};
};

// Lays out exactly what "Highlight connections" highlights — everything reachable forward
// (descendants) and reverse (ancestors) from one node — as its own small, clean tree instead of a
// colored overlay on the full (often huge) graph. The target node is the shared anchor: its
// descendants fan out below it, its ancestors fan out above it, and both sides are centered on the
// same vertical line as the target regardless of how wide either side's subtree is. If the target
// sits high up a very bushy tree, its descendant set can itself still be large — isolating it
// doesn't shrink the underlying data, just the rest of the graph that isn't part of it.
export const layoutConnectedSubgraph = (
	target: NodeObject,
	forwardNodes: Set<NodeObject>,
	reverseNodes: Set<NodeObject>,
) => {
	const forwardAllowed = new Set(forwardNodes).add(target);
	const reverseAllowed = new Set(reverseNodes).add(target);
	const forwardShape = buildTreeShape(target, node => node.edgesOut.map(edge => edge.target), forwardAllowed);
	const reverseShape = buildTreeShape(target, node => node.edgesIn.map(edge => edge.source), reverseAllowed);

	const forwardWidths = computeSlotWidths(forwardShape);
	const reverseWidths = computeSlotWidths(reverseShape);

	const forwardStarts = assignSlotStarts(forwardShape, forwardWidths, [target]);
	const reverseStarts = assignSlotStarts(reverseShape, reverseWidths, [target]);

	// Both trees independently center the target within its own (forward or reverse) slot width —
	// align the reverse tree so the target ends up at the exact same x both passes agree on.
	const targetForwardAlong = (forwardWidths.get(target)! - ownWidth(target)) / 2;
	const targetReverseAlongRaw = (reverseWidths.get(target)! - ownWidth(target)) / 2;
	const reverseAlignOffset = targetForwardAlong - targetReverseAlongRaw;

	for (const node of forwardShape.bfsOrder) {
		node.x = forwardStarts.get(node)! + ((forwardWidths.get(node)! - ownWidth(node)) / 2);
		node.y = forwardShape.depthOf.get(node)! * verticalSpacing;
	}

	for (const node of reverseShape.bfsOrder) {
		if (node === target) {
			continue; // Already positioned by the forward pass above.
		}

		node.x = reverseStarts.get(node)! + ((reverseWidths.get(node)! - ownWidth(node)) / 2) + reverseAlignOffset;
		node.y = -(reverseShape.depthOf.get(node)! * verticalSpacing);
	}

	const padding = 20;
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const node of new Set([...forwardShape.bfsOrder, ...reverseShape.bfsOrder])) {
		minX = Math.min(minX, node.x!);
		maxX = Math.max(maxX, node.x! + ownWidth(node));
		minY = Math.min(minY, node.y!);
		maxY = Math.max(maxY, node.y! + node.textHeight + 10);
	}

	return {
		x: minX - padding,
		y: minY - padding,
		width: (maxX - minX) + (2 * padding),
		height: (maxY - minY) + (2 * padding),
	};
};
