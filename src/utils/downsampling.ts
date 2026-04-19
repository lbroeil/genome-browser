/**
 * Reservoir sampling: randomly select maxItems from an array.
 * Returns items in their original order.
 */
export function downsample<T>(items: T[], maxItems: number): T[] {
  if (items.length <= maxItems) return items

  // Build reservoir with indices to preserve order
  const reservoir: { index: number; item: T }[] = []

  for (let i = 0; i < items.length; i++) {
    if (i < maxItems) {
      reservoir.push({ index: i, item: items[i] })
    } else {
      const j = Math.floor(Math.random() * (i + 1))
      if (j < maxItems) {
        reservoir[j] = { index: i, item: items[i] }
      }
    }
  }

  // Sort by original index to preserve spatial order
  reservoir.sort((a, b) => a.index - b.index)
  return reservoir.map((r) => r.item)
}
