interface RGB {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface processingOptions {
  greyscaleMethod: 'luminance' | 'average' | 'none';
  ditherMethod: 'atkinson' | 'threshold';
  ditherThreshold: number;
  replaceColours?: boolean;
  replaceColourMap: {
    black: RGB;
    white: RGB;
  };
}

export function dither(
  image: ImageData,
  options: processingOptions
): ImageData {
  if (options.greyscaleMethod == 'luminance') {
    greyscale_luminance(image);
  } else if (options.greyscaleMethod == 'average') {
    greyscale_average(image);
  }

  if (options.ditherMethod == 'atkinson') {
    dither_atkinson(image, options.greyscaleMethod == 'none');
  } else if (options.ditherMethod == 'threshold') {
    dither_threshold(image, options.ditherThreshold);
  }

  if (options.replaceColours == true) {
    replace_colours(
      image,
      options.replaceColourMap.black,
      options.replaceColourMap.white
    );
  }

  return image;
}

// Convert image data to greyscale based on luminance.
function greyscale_luminance(image: ImageData) {
  for (var i = 0; i <= image.data.length; i += 4) {
    image.data[i] =
      image.data[i + 1] =
      image.data[i + 2] =
        parseInt(
          (image.data[i] * 0.21 +
            image.data[i + 1] * 0.71 +
            image.data[i + 2] * 0.07,
          10) as any
        );
  }

  return image;
}

// Convert image data to greyscale based on average of R, G and B values.
function greyscale_average(image: ImageData) {
  for (var i = 0; i <= image.data.length; i += 4) {
    image.data[i] =
      image.data[i + 1] =
      image.data[i + 2] =
        parseInt(
          ((image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3) as any,
          10
        );
  }

  return image;
}

// Apply Atkinson Dither to Image Data
function dither_atkinson(image: ImageData, drawColour?: boolean) {
  let skipPixels = 4;

  if (!drawColour) drawColour = false;

  if (drawColour == true) skipPixels = 4;

  let imageLength = image.data.length;

  for (
    let currentPixel = 0;
    currentPixel <= imageLength;
    currentPixel += skipPixels
  ) {
    const newPixelColour = image.data[currentPixel] <= 128 ? 0 : 255;

    const err = parseInt(
      ((image.data[currentPixel] - newPixelColour) / 8) as any,
      10
    );
    image.data[currentPixel] = newPixelColour;

    image.data[currentPixel + 4] += err;
    image.data[currentPixel + 8] += err;
    image.data[currentPixel + 4 * image.width - 4] += err;
    image.data[currentPixel + 4 * image.width] += err;
    image.data[currentPixel + 4 * image.width + 4] += err;
    image.data[currentPixel + 8 * image.width] += err;

    if (drawColour == false)
      image.data[currentPixel + 1] = image.data[currentPixel + 2] =
        image.data[currentPixel];
  }

  return image.data;
}

function dither_threshold(image: ImageData, threshold_value: number) {
  for (var i = 0; i <= image.data.length; i += 4) {
    image.data[i] = image.data[i] > threshold_value ? 255 : 0;
    image.data[i + 1] = image.data[i + 1] > threshold_value ? 255 : 0;
    image.data[i + 2] = image.data[i + 2] > threshold_value ? 255 : 0;
  }
}

function replace_colours(image: ImageData, black: RGB, white: RGB) {
  for (var i = 0; i <= image.data.length; i += 4) {
    image.data[i] = image.data[i] < 127 ? black.r : white.r;
    image.data[i + 1] = image.data[i + 1] < 127 ? black.g : white.g;
    image.data[i + 2] = image.data[i + 2] < 127 ? black.b : white.b;
    image.data[i + 3] =
      (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3 < 127
        ? black.a
        : white.a;
  }
}
