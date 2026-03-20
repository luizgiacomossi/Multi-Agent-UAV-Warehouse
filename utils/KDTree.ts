import { Position3D } from '../types';

export class KDNode<T> {
  item: T;
  left: KDNode<T> | null = null;
  right: KDNode<T> | null = null;
  position: Position3D;

  constructor(item: T, position: Position3D) {
    this.item = item;
    this.position = position;
  }
}

export class KDTree<T> {
  root: KDNode<T> | null = null;
  getPosition: (item: T) => Position3D;

  constructor(items: T[], getPosition: (item: T) => Position3D) {
    this.getPosition = getPosition;
    this.root = this.buildTree([...items], 0);
  }

  private buildTree(items: T[], depth: number): KDNode<T> | null {
    if (items.length === 0) return null;

    const axis = depth % 3; // 0: x, 1: y, 2: z

    // Sort items based on the current axis
    items.sort((a, b) => {
      const posA = this.getPosition(a);
      const posB = this.getPosition(b);
      return axis === 0 ? posA.x - posB.x : (axis === 1 ? posA.y - posB.y : posA.z - posB.z);
    });

    const medianIdx = Math.floor(items.length / 2);
    const medianItem = items[medianIdx];
    const node = new KDNode(medianItem, this.getPosition(medianItem));

    node.left = this.buildTree(items.slice(0, medianIdx), depth + 1);
    node.right = this.buildTree(items.slice(medianIdx + 1), depth + 1);

    return node;
  }

  // Manhattan distance for the A* heuristic grid metrics
  private dist(p1: Position3D, p2: Position3D): number {
    return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y) + Math.abs(p1.z - p2.z);
  }

  /**
   * Returns all items within the specified Manhattan radius
   */
  public rangeQuery(center: Position3D, radius: number): T[] {
    const results: T[] = [];
    this.searchNode(this.root, 0, center, radius, results);
    return results;
  }

  private searchNode(node: KDNode<T> | null, depth: number, center: Position3D, radius: number, results: T[]) {
    if (!node) return;

    if (this.dist(node.position, center) <= radius) {
      results.push(node.item); // Add the item to the results if it is within the radius
    }

    const axis = depth % 3;
    const centerVal = axis === 0 ? center.x : (axis === 1 ? center.y : center.z);
    const nodeVal = axis === 0 ? node.position.x : (axis === 1 ? node.position.y : node.position.z);

    // Bound checking: Search left bounded branch if center is within radius reach
    if (centerVal - radius <= nodeVal) {
      this.searchNode(node.left, depth + 1, center, radius, results);
    }
    // Bound checking: Search right bounded branch if center is within radius reach
    if (centerVal + radius >= nodeVal) {
      this.searchNode(node.right, depth + 1, center, radius, results);
    }
  }
}
