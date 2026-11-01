type Rectangle = { x: number; y: number; width: number; height: number };
export function fitWindow(bounds: Rectangle, areas: Rectangle[]): Rectangle {
  if (!areas.length || [...areas, bounds].some(r => !Object.values(r).every(Number.isFinite) || r.width <= 0 || r.height <= 0)) throw new Error("invalid_display_bounds");
  const overlap = (area: Rectangle): number => Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)) * Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y));
  const area = areas.reduce((best, next) => overlap(next) > overlap(best) ? next : best);
  const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height);
  return { width, height, x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)) };
}
