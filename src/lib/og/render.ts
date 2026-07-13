/**
 * Render a satori VDOM node to a PNG buffer: satori → SVG, then sharp → PNG.
 * sharp is already present (transitive via astro:assets), so no extra
 * rasteriser dependency. Emoji are supplied via loadAdditionalAsset.
 */

import satori from 'satori';
import { fonts } from './fonts';
import { emojiSvgDataUri } from './emoji';
import { CARD_W, CARD_H } from './cards';

export async function renderCard(node: Parameters<typeof satori>[0]): Promise<Buffer> {
  const svg = await satori(node, {
    width: CARD_W,
    height: CARD_H,
    fonts,
    loadAdditionalAsset: async (code, segment) => {
      if (code === 'emoji') return emojiSvgDataUri(segment) ?? '';
      return '';
    },
  });

  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(svg)).png().toBuffer();
}
