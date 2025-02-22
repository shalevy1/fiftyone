/**
 * Copyright 2017-2022, Voxel51, Inc.
 */

export { createColorGenerator, getRGB } from "@fiftyone/utilities";
export { freeVideos } from "./elements/util";
export * from "./lookers";
export type {
  Coloring,
  FrameConfig,
  FrameOptions,
  ImageConfig,
  ImageOptions,
  Point,
  VideoConfig,
  VideoOptions,
} from "./state";
export { zoomAspectRatio } from "./zoom";

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];
