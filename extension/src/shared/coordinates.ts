export interface CssPoint {
  x: number;
  y: number;
}

export function imageToCssPoint(imgX: number, imgY: number, devicePixelRatio: number): CssPoint {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  return {
    x: imgX / dpr,
    y: imgY / dpr,
  };
}
