import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { RasterEnv } from 'universal-label-renderer';

export const nodeRasterEnv: RasterEnv = {
  createCanvas(width, height) {
    return createCanvas(width, height) as unknown as ReturnType<RasterEnv['createCanvas']>;
  },
  async loadImage(src) {
    return await loadImage(src) as unknown as CanvasImageSource;
  }
};

export function measureTextNode(text: string, font: string): number {
  const context = createCanvas(1, 1).getContext('2d');
  context.font = font;
  return context.measureText(text).width;
}
