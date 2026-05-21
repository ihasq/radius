/**
 * テスト分離ヘルパー（後方互換性用）
 *
 * 直列実行では RADIUS_HOME 分離は不要。
 * これらの関数は後方互換性のためにエクスポートされるが、何もしない。
 */

/**
 * @deprecated 直列実行では不要
 */
export function setupTestRadiusHome(_testGroupId: string): void {
  // No-op
}

/**
 * @deprecated 直列実行では不要
 */
export function cleanupTestRadiusHome(): void {
  // No-op
}
