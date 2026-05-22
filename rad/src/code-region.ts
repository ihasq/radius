import type { CodeRegion } from './types';

export class CodeRegionMap {
  private regions: CodeRegion[] = [];

  register(region: CodeRegion): void {
    // 重複チェック: 同じファイル・行範囲で先に登録された方が優先
    const existing = this.getOwner(region.filePath, region.startLine);
    if (existing) return; // 先着優先
    this.regions.push(region);
  }

  getOwner(filePath: string, line: number): string | null {
    for (const r of this.regions) {
      if (r.filePath === filePath && line >= r.startLine && line <= r.endLine) {
        return r.ownerId;
      }
    }
    return null;
  }

  getRegionsForFile(filePath: string): CodeRegion[] {
    return this.regions.filter(r => r.filePath === filePath);
  }

  isUnowned(filePath: string, line: number): boolean {
    return this.getOwner(filePath, line) === null;
  }
}
