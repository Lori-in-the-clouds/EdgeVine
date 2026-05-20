export type CameraParams = {
  focal_length: number;
  sensor_width: number;
  distance: number;
};

export type VisionSettings = {
  depth_uncertainty_pct: number;
  camera_params: CameraParams;
};

export const MAX_DEPTH_UNCERTAINTY_PCT = 20;

export const DEFAULT_CAMERA_PARAMS: CameraParams = {
  focal_length: 3.04,
  sensor_width: 3.68,
  distance: 2000
};

export const DEFAULT_VISION_SETTINGS: VisionSettings = {
  depth_uncertainty_pct: 10,
  camera_params: DEFAULT_CAMERA_PARAMS
};

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberOrFallback(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function positiveNumberOrFallback(value: unknown, fallback: number): number {
  const numeric = numberOrFallback(value, fallback);
  return numeric > 0 ? numeric : fallback;
}

export function normalizeVisionSettings(raw: unknown): VisionSettings {
  const record = objectRecord(raw);
  const cameraRecord = objectRecord(record.camera_params);
  const cameraSource = Object.keys(cameraRecord).length > 0 ? cameraRecord : record;

  const depth = numberOrFallback(
    record.depth_uncertainty_pct,
    DEFAULT_VISION_SETTINGS.depth_uncertainty_pct
  );

  return {
    depth_uncertainty_pct: Math.min(MAX_DEPTH_UNCERTAINTY_PCT, Math.max(0, depth)),
    camera_params: {
      focal_length: positiveNumberOrFallback(cameraSource.focal_length, DEFAULT_CAMERA_PARAMS.focal_length),
      sensor_width: positiveNumberOrFallback(cameraSource.sensor_width, DEFAULT_CAMERA_PARAMS.sensor_width),
      distance: positiveNumberOrFallback(cameraSource.distance, DEFAULT_CAMERA_PARAMS.distance)
    }
  };
}

export function validateVisionSettings(raw: unknown): VisionSettings {
  const record = objectRecord(raw);
  const cameraRecord = objectRecord(record.camera_params);
  const cameraSource = Object.keys(cameraRecord).length > 0 ? cameraRecord : record;

  const depth = Number(record.depth_uncertainty_pct);
  if (!Number.isFinite(depth) || depth < 0 || depth > MAX_DEPTH_UNCERTAINTY_PCT) {
    throw new Error(`depth_uncertainty_pct must be a number between 0 and ${MAX_DEPTH_UNCERTAINTY_PCT}`);
  }

  const focalLength = Number(cameraSource.focal_length);
  const sensorWidth = Number(cameraSource.sensor_width);
  const distance = Number(cameraSource.distance);

  if (!Number.isFinite(focalLength) || focalLength <= 0) {
    throw new Error('camera_params.focal_length must be a number greater than 0');
  }

  if (!Number.isFinite(sensorWidth) || sensorWidth <= 0) {
    throw new Error('camera_params.sensor_width must be a number greater than 0');
  }

  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error('camera_params.distance must be a number greater than 0');
  }

  return {
    depth_uncertainty_pct: depth,
    camera_params: {
      focal_length: focalLength,
      sensor_width: sensorWidth,
      distance
    }
  };
}
