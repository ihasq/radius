/**
 * Mermaid グラフビルダー
 */

export type NodeStyle = "default" | "highlight" | "external";

interface Node {
  id: string;
  label: string;
  style: NodeStyle;
}

interface Edge {
  from: string;
  to: string;
  label?: string;
}

/**
 * Mermaid 記法のグラフを組み立てるユーティリティ。
 */
export class MermaidBuilder {
  private direction: "TD" | "LR";
  private nodes: Map<string, Node> = new Map();
  private edges: Edge[] = [];

  constructor(direction: "TD" | "LR" = "LR") {
    this.direction = direction;
  }

  /**
   * ノードを追加する。
   */
  addNode(id: string, label: string, style: NodeStyle = "default"): void {
    this.nodes.set(id, { id, label, style });
  }

  /**
   * エッジを追加する。
   */
  addEdge(fromId: string, toId: string, label?: string): void {
    this.edges.push({ from: fromId, to: toId, label });
  }

  /**
   * Mermaid 記法のテキストを出力する。
   */
  build(): string {
    const lines: string[] = [];
    lines.push(`graph ${this.direction}`);

    // ノード定義
    for (const node of this.nodes.values()) {
      const escapedLabel = this.escapeLabel(node.label);
      const styleClass = node.style !== "default" ? `:::${node.style}` : "";
      lines.push(`  ${node.id}["${escapedLabel}"]${styleClass}`);
    }

    // エッジ定義
    for (const edge of this.edges) {
      if (edge.label) {
        const escapedLabel = this.escapeLabel(edge.label);
        lines.push(`  ${edge.from} -->|"${escapedLabel}"| ${edge.to}`);
      } else {
        lines.push(`  ${edge.from} --> ${edge.to}`);
      }
    }

    // スタイル定義
    if (this.hasStyle("highlight") || this.hasStyle("external")) {
      lines.push("");
      if (this.hasStyle("highlight")) {
        lines.push("  classDef highlight stroke:#f00,stroke-width:3px");
      }
      if (this.hasStyle("external")) {
        lines.push("  classDef external stroke-dasharray: 5 5");
      }
    }

    return lines.join("\n");
  }

  /**
   * 指定スタイルのノードが存在するか確認する。
   */
  private hasStyle(style: NodeStyle): boolean {
    for (const node of this.nodes.values()) {
      if (node.style === style) return true;
    }
    return false;
  }

  /**
   * Mermaid のラベル用に文字列をエスケープする。
   */
  private escapeLabel(text: string): string {
    return text
      .replace(/"/g, "#quot;")
      .replace(/</g, "#lt;")
      .replace(/>/g, "#gt;")
      .replace(/\n/g, " ");
  }
}
