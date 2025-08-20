export function applyNoise(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity = 50,
  type: 'white' | 'grayscale' | 'salt-pepper' | 'perlin' = 'white'
): ImageData {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let noise;

    switch (type) {
      case 'white':
        // White noise: random values between -intensity and +intensity
        noise = (Math.random() - 0.5) * 2 * intensity;
        data[i] = Math.max(0, Math.min(255, data[i] + noise)); // Red
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise)); // Green
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise)); // Blue
        break;

      case 'grayscale':
        // Grayscale noise: same random value for all channels
        noise = (Math.random() - 0.5) * 2 * intensity;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        break;

      case 'salt-pepper':
        // Salt and pepper noise: random black or white pixels
        if (Math.random() < intensity / 255) {
          const value = Math.random() < 0.5 ? 0 : 255;
          data[i] = value;
          data[i + 1] = value;
          data[i + 2] = value;
        }
        break;

      case 'perlin':
        // Simple pseudo-Perlin noise pattern
        const x = (i / 4) % width;
        const y = Math.floor(i / 4 / width);
        noise = Math.sin(x * 0.1) * Math.cos(y * 0.1) * intensity;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        break;
    }
  }

  return imageData;
}
