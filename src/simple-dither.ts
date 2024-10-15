export function dither(imagedata: ImageData): ImageData {
  let clone = new ImageData(
    new Uint8ClampedArray(imagedata.data),
    imagedata.width,
    imagedata.height
  );

  function px(x: number, y: number) {
    return x * 4 + y * imagedata.width * 4;
  }

  for (let y = 0; y < imagedata.height; y++) {
    for (let x = 0; x < imagedata.width; x++) {
      let oldPixel = clone.data[px(x, y)];
      let newPixel = oldPixel > 125 ? 255 : 0;
      clone.data[px(x, y)] =
        clone.data[px(x, y) + 1] =
        clone.data[px(x, y) + 2] =
          newPixel;
      let quantError = oldPixel - newPixel;
      clone.data[px(x + 1, y)] =
        clone.data[px(x + 1, y) + 1] =
        clone.data[px(x + 1, y) + 2] =
          clone.data[px(x + 1, y)] + (quantError * 7) / 16;
      clone.data[px(x - 1, y + 1)] =
        clone.data[px(x - 1, y + 1) + 1] =
        clone.data[px(x - 1, y + 1) + 2] =
          clone.data[px(x - 1, y + 1)] + (quantError * 3) / 16;
      clone.data[px(x, y + 1)] =
        clone.data[px(x, y + 1) + 1] =
        clone.data[px(x, y + 1) + 2] =
          clone.data[px(x, y + 1)] + (quantError * 5) / 16;
      clone.data[px(x + 1, y + 1)] =
        clone.data[px(x + 1, y + 1) + 1] =
        clone.data[px(x + 1, y + 1) + 2] =
          clone.data[px(x + 1, y + 1)] + (quantError * 1) / 16;
    }
  }

  return clone;
}
