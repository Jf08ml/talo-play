/** Center-crops an image file to a square JPEG of at most `size` px per side. */
export async function cropSquare(file: File, size: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width === 0 || bitmap.height === 0) {
    // Browsers that can't decode a format (HEIC is the classic case) may
    // resolve with a 0×0 bitmap instead of rejecting.
    throw new Error(
      `No se pudo leer "${file.name}" (¿está dañada o en un formato no soportado, como HEIC?). Probá con JPG, PNG o WEBP.`
    );
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(size, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))),
      "image/jpeg",
      quality
    )
  );
}
