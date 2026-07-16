// Encode a sequence of PNG frame buffers into one animated GIF — pure JS, no ffmpeg.
// Used by capture-shots.js --motion: some screens (loading→loaded, star fields, carousels) can't
// be told in a single frame. pngjs decodes each screenshot, we downscale (a card thumbnail is tiny),
// gifenc quantizes + writes the animated GIF.
const { PNG } = require('pngjs');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

// nearest-neighbour downscale of an RGBA buffer to a target width (keeps aspect). Upscale is a no-op.
function resizeRGBA(data, w, h, targetW) {
  if (!targetW || targetW >= w) return { data, w, h };
  const th = Math.max(1, Math.round(h * targetW / w));
  const out = Buffer.alloc(targetW * th * 4);
  for (let y = 0; y < th; y++) {
    const sy = Math.min(h - 1, Math.floor(y * h / th));
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(w - 1, Math.floor(x * targetW / w));
      const si = (sy * w + sx) * 4, di = (y * targetW + x) * 4;
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
    }
  }
  return { data: out, w: targetW, h: th };
}

// pngBuffers: Buffer[] of PNG frames (all same dimensions). opts: {width, delay, loop}
function encodeGif(pngBuffers, opts = {}) {
  const width = opts.width || 240;
  const delay = opts.delay || 350;             // ms per frame
  const gif = GIFEncoder();
  for (const buf of pngBuffers) {
    const png = PNG.sync.read(buf);            // {width,height,data:RGBA}
    const { data, w, h } = resizeRGBA(png.data, png.width, png.height, width);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, w, h, { palette, delay });
  }
  gif.finish();
  return Buffer.from(gif.bytes());             // opts.loop=0 (infinite) is gifenc's default
}

module.exports = { encodeGif, resizeRGBA };
