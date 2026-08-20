import sharp from 'sharp';

/**
 * Extracts clean characters from ink-splash/blob captchas by flood-filling outer background.
 * Enclosed characters inside black splashes become dark text on white background.
 * 
 * @param {Buffer|string} input 
 * @param {number} threshold - Binarization threshold (default: 115)
 * @returns {Promise<Buffer>}
 */
export async function extractEnclosedText(input, threshold = 115) {
  const { data, info } = await sharp(input, { failOn: 'none' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // Binarize
  const gray = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push(data[y * width + x] > threshold ? 255 : 0);
    }
    gray.push(row);
  }

  // Flood fill from borders
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const queue = [];

  for (let x = 0; x < width; x++) {
    if (gray[0][x] === 255) { queue.push([0, x]); visited[0][x] = true; }
    if (gray[height - 1][x] === 255) { queue.push([height - 1, x]); visited[height - 1][x] = true; }
  }
  for (let y = 0; y < height; y++) {
    if (gray[y][0] === 255 && !visited[y][0]) { queue.push([y, 0]); visited[y][0] = true; }
    if (gray[y][width - 1] === 255 && !visited[y][width - 1]) { queue.push([y, width - 1]); visited[y][width - 1] = true; }
  }

  while (queue.length > 0) {
    const [cy, cx] = queue.shift();
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dy, dx] of dirs) {
      const ny = cy + dy;
      const nx = cx + dx;
      if (ny >= 0 && ny < height && nx >= 0 && nx < width && !visited[ny][nx] && gray[ny][nx] === 255) {
        visited[ny][nx] = true;
        queue.push([ny, nx]);
      }
    }
  }

  // Invert enclosed characters into crisp black on white
  const clean = Buffer.alloc(width * height, 255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isOuterBg = visited[y][x];
      const isWhite = gray[y][x] === 255;

      if ((!isOuterBg && isWhite) || (isOuterBg && !isWhite)) {
        clean[y * width + x] = 0;
      }
    }
  }

  // Thicken thin horizontal minus dashes if detected
  const enhanced = Buffer.from(clean);
  for (let y = 5; y < height - 5; y++) {
    for (let x = 5; x < width - 15; x++) {
      let isHLine = true;
      for (let dx = 0; dx < 6; dx++) {
        if (clean[y * width + (x + dx)] !== 0) isHLine = false;
      }
      if (isHLine && clean[(y - 3) * width + x] === 255 && clean[(y + 3) * width + x] === 255) {
        for (let dy = -1; dy <= 2; dy++) {
          for (let dx = 0; dx < 8; dx++) {
            if (x + dx < width && y + dy >= 0 && y + dy < height) {
              enhanced[(y + dy) * width + (x + dx)] = 0;
            }
          }
        }
      }
    }
  }

  return sharp(enhanced, { raw: { width, height, channels: 1 } })
    .resize(width * 4, height * 4, { kernel: 'lanczos3' })
    .extend({
      top: 25,
      bottom: 25,
      left: 25,
      right: 25,
      background: { r: 255, g: 255, b: 255 }
    })
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();
}

/**
 * Preprocesses a captcha image and returns multiple candidate buffers.
 * @param {Buffer|string} input 
 * @returns {Promise<Buffer[]>}
 */
export async function preprocessCaptcha(input) {
  const candidates = [];
  const thresholds = [115, 100, 130, 145];

  for (const th of thresholds) {
    try {
      const extracted = await extractEnclosedText(input, th);
      candidates.push(extracted);
    } catch (e) {
      // ignore
    }
  }

  // Standard grayscale + high contrast fallback
  try {
    const highContrast = await sharp(input, { failOn: 'none' })
      .resize({ width: 700, kernel: 'lanczos3' })
      .grayscale()
      .linear(1.8, -40)
      .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#ffffff' })
      .withMetadata({ density: 300 })
      .png()
      .toBuffer();
    candidates.push(highContrast);
  } catch (e) {}

  return candidates;
}

/**
 * Converts a Base64 string (with or without data URI prefix) to Buffer.
 * @param {string} base64Str 
 * @returns {Buffer}
 */
export function base64ToBuffer(base64Str) {
  const cleanBase64 = base64Str.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(cleanBase64, 'base64');
}
