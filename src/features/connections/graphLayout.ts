import type { GraphEdge, GraphNode } from '../../database/repositories/linksRepo';

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  radius: number;
}

/**
 * Deterministic, fast force-directed layout computed in pure TypeScript.
 * Runs a bounded number of iterations so the Android UI stays responsive.
 */
export function computeGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
): PositionedNode[] {
  if (nodes.length === 0) return [];

  const cx = width / 2;
  const cy = height / 2;
  const initRadius = Math.min(width, height) * 0.34;

  const positioned: PositionedNode[] = nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, nodes.length);
    return {
      ...n,
      x: cx + initRadius * Math.cos(angle),
      y: cy + initRadius * Math.sin(angle),
      radius: Math.min(20, 10 + n.degree * 2),
    };
  });

  if (positioned.length === 1) {
    positioned[0].x = cx;
    positioned[0].y = cy;
    return positioned;
  }

  const indexMap = new Map(positioned.map((n, i) => [n.id, i]));
  const iterations = 45;
  const repulsion = 2600;
  const springLength = 95;
  const springK = 0.04;
  const gravity = 0.025;

  for (let iter = 0; iter < iterations; iter += 1) {
    const dx = new Float64Array(positioned.length);
    const dy = new Float64Array(positioned.length);

    // Pairwise repulsion
    for (let i = 0; i < positioned.length; i += 1) {
      for (let j = i + 1; j < positioned.length; j += 1) {
        const vx = positioned[i].x - positioned[j].x;
        const vy = positioned[i].y - positioned[j].y;
        const distSq = vx * vx + vy * vy + 1;
        const dist = Math.sqrt(distSq);
        const force = repulsion / distSq;
        const fx = (vx / dist) * force;
        const fy = (vy / dist) * force;
        dx[i] += fx;
        dy[i] += fy;
        dx[j] -= fx;
        dy[j] -= fy;
      }
    }

    // Spring attraction along edges
    for (const edge of edges) {
      const si = indexMap.get(edge.source);
      const ti = indexMap.get(edge.target);
      if (si === undefined || ti === undefined) continue;
      const vx = positioned[ti].x - positioned[si].x;
      const vy = positioned[ti].y - positioned[si].y;
      const dist = Math.sqrt(vx * vx + vy * vy) || 1;
      const displacement = dist - springLength;
      const fx = (vx / dist) * displacement * springK;
      const fy = (vy / dist) * displacement * springK;
      dx[si] += fx;
      dy[si] += fy;
      dx[ti] -= fx;
      dy[ti] -= fy;
    }

    // Center gravity & position update
    const damping = 0.85 * (1 - iter / (iterations * 1.3));
    for (let i = 0; i < positioned.length; i += 1) {
      dx[i] += (cx - positioned[i].x) * gravity;
      dy[i] += (cy - positioned[i].y) * gravity;
      positioned[i].x = Math.max(36, Math.min(width - 36, positioned[i].x + dx[i] * damping));
      positioned[i].y = Math.max(36, Math.min(height - 36, positioned[i].y + dy[i] * damping));
    }
  }

  return positioned;
}
