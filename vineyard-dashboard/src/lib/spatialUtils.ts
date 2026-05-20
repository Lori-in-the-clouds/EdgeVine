// Manual Spatial Utilities to replace Turf.js
// This fixes the module resolution issue in the Astro/Vite environment.

export interface Point {
  lng: number;
  lat: number;
}

/**
 * Checks if a point is inside a polygon using the Ray Casting algorithm.
 */
export function booleanPointInPolygon(point: [number, number], polygon: any): boolean {
  let coords = [];
  if (polygon.geometry && polygon.geometry.type === 'Polygon') {
    coords = polygon.geometry.coordinates[0];
  } else if (polygon.type === 'Polygon') {
    coords = polygon.coordinates[0];
  } else if (Array.isArray(polygon)) {
    coords = polygon;
  }

  if (!coords || coords.length === 0) return false;

  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1];
    const xj = coords[j][0], yj = coords[j][1];
    
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculates the bounding box of a GeoJSON feature or coordinate array.
 */
export function calculateBBox(feature: any): [number, number, number, number] {
  let coords: [number, number][] = [];
  if (feature.geometry) {
    coords = feature.geometry.coordinates[0];
  } else if (feature.coordinates) {
    coords = feature.coordinates[0];
  }

  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  coords.forEach(p => {
    if (p[0] < minLng) minLng = p[0];
    if (p[1] < minLat) minLat = p[1];
    if (p[0] > maxLng) maxLng = p[0];
    if (p[1] > maxLat) maxLat = p[1];
  });
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Calculates the center (centroid) of a polygon.
 */
export function calculateCenter(feature: any): { geometry: { coordinates: [number, number] } } {
  let coords: [number, number][] = [];
  if (feature.geometry) {
    coords = feature.geometry.coordinates[0];
  } else if (feature.coordinates) {
    coords = feature.coordinates[0];
  }

  let sumLng = 0, sumLat = 0;
  coords.forEach(p => {
    sumLng += p[0];
    sumLat += p[1];
  });
  return {
    geometry: {
      coordinates: [sumLng / coords.length, sumLat / coords.length]
    }
  };
}

/**
 * Rotates a line around a pivot point.
 */
export function rotateLine(lineCoords: [number, number][], angleDeg: number, pivot: [number, number]): [number, number][] {
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const [cx, cy] = pivot;

  return lineCoords.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [
      cx + dx * cos - dy * sin,
      cy + dx * sin + dy * cos
    ];
  });
}

/**
 * Haversine distance in meters between two [lng, lat] points.
 */
export function getDistance(p1: [number, number], p2: [number, number]): number {
  const R = 6371e3;
  const φ1 = p1[1] * Math.PI / 180;
  const φ2 = p2[1] * Math.PI / 180;
  const Δφ = (p2[1] - p1[1]) * Math.PI / 180;
  const Δλ = (p2[0] - p1[0]) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Precision Line-Polygon Intersection.
 * Finds all intersection points between a segment and polygon edges.
 */
function getIntersections(p1: [number, number], p2: [number, number], polygonCoords: [number, number][]): [number, number][] {
  const intersections: [number, number][] = [];
  
  for (let i = 0; i < polygonCoords.length - 1; i++) {
    const p3 = polygonCoords[i]!;
    const p4 = polygonCoords[i+1]!;
    
    // Line segment intersection formula
    const denominator = ((p4[1] - p3[1]) * (p2[0] - p1[0])) - ((p4[0] - p3[0]) * (p2[1] - p1[1]));
    if (denominator === 0) continue; // Parallel
    
    let ua = (((p4[0] - p3[0]) * (p1[1] - p3[1])) - ((p4[1] - p3[1]) * (p1[0] - p3[0]))) / denominator;
    let ub = (((p2[0] - p1[0]) * (p1[1] - p3[1])) - ((p2[1] - p1[1]) * (p1[0] - p3[0]))) / denominator;
    
    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      intersections.push([
        p1[0] + ua * (p2[0] - p1[0]),
        p1[1] + ua * (p2[1] - p1[1])
      ]);
    }
  }
  return intersections;
}

/**
 * Precision Clipping: Ensures rows touch the polygon boundaries exactly.
 */
export function clipLineToPolygon(lineCoords: [number, number][], polygon: any): [number, number][][] {
  let polyCoords: [number, number][] = [];
  if (polygon.geometry) polyCoords = polygon.geometry.coordinates[0];
  else if (polygon.coordinates) polyCoords = polygon.coordinates[0];
  else if (Array.isArray(polygon)) polyCoords = polygon;

  if (polyCoords.length < 3) return [];

  const [p1, p2] = lineCoords;
  if (!p1 || !p2) return [];

  // 1. Get all intersections
  const intersections = getIntersections(p1, p2, polyCoords);
  
  // 2. Add endpoints if they are inside
  if (booleanPointInPolygon(p1, polygon)) intersections.push(p1);
  if (booleanPointInPolygon(p2, polygon)) intersections.push(p2);
  
  if (intersections.length < 2) return [];

  // 3. Sort points along the line direction
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  
  intersections.sort((a, b) => {
    const tA = (dx !== 0) ? (a[0] - p1[0]) / dx : (a[1] - p1[1]) / dy;
    const tB = (dx !== 0) ? (b[0] - p1[0]) / dx : (b[1] - p1[1]) / dy;
    return tA - tB;
  });

  // 4. Remove near duplicates
  const uniquePoints: [number, number][] = [];
  for (let pt of intersections) {
    if (uniquePoints.length === 0 || getDistance(pt, uniquePoints[uniquePoints.length - 1]!) > 0.01) {
      uniquePoints.push(pt);
    }
  }

  // 5. Build segments from inside pairs
  const result: [number, number][][] = [];
  for (let i = 0; i < uniquePoints.length - 1; i++) {
    const start = uniquePoints[i]!;
    const end = uniquePoints[i+1]!;
    const midpoint: [number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    
    if (booleanPointInPolygon(midpoint, polygon)) {
      result.push([start, end]);
    }
  }

  return result;
}

/**
 * Calculates the area of a polygon in square meters.
 * Uses a spherical surface approximation.
 */
export function calculateArea(polygon: any): number {
  let coords: [number, number][] = [];
  if (polygon.geometry) coords = polygon.geometry.coordinates[0];
  else if (polygon.coordinates) coords = polygon.coordinates[0];
  else if (Array.isArray(polygon)) coords = polygon;

  if (!coords || coords.length < 3) return 0;

  let area = 0;
  const R = 6371000; // Earth radius in meters

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i]!;
    const p2 = coords[i+1]!;
    
    const lon1 = p1[0] * Math.PI / 180;
    const lat1 = p1[1] * Math.PI / 180;
    const lon2 = p2[0] * Math.PI / 180;
    const lat2 = p2[1] * Math.PI / 180;

    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  return Math.abs(area * R * R / 2.0);
}
