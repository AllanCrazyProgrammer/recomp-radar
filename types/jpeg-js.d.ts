declare module 'jpeg-js' {
  type JpegImage = {width: number; height: number; data: Uint8Array};
  type JpegModule = {
    decode(data: Uint8Array | ArrayBuffer, options?: {useTArray?: boolean; formatAsRGBA?: boolean; maxResolutionInMP?: number; maxMemoryUsageInMB?: number}): JpegImage;
    encode(image: JpegImage, quality?: number): JpegImage;
  };
  const jpeg: JpegModule;
  export default jpeg;
}
