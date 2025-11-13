import dagre from 'dagre';
import { Edge, Node, Position } from 'reactflow';

// 使用 Dagre 进行自动布局
// 参考: https://reactflow.dev/learn/layouting/layouting#dagre
export function getLayoutedElements(nodes: Node[], edges: Edge[], direction: 'LR' | 'TB' = 'LR'): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 150 });

  // 默认节点尺寸（如果节点没有设置 width/height）
  const nodeWidth = 200;
  const nodeHeight = 100;

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: node.width || nodeWidth,
      height: node.height || nodeHeight
    });
  });

  edges.forEach((edge) => {
    if (edge.source && edge.target) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const width = node.width || nodeWidth;
    const height = node.height || nodeHeight;
    return {
      ...node,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2
      }
    };
  });

  return { nodes: layoutedNodes, edges };
}

// 兼容旧接口
export function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const { nodes: layoutedNodes } = getLayoutedElements(nodes, edges);
  return layoutedNodes;
}
