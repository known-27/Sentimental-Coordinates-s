/**
 * Haversine Formula - Server-side distance calculation
 * Returns distance in meters between two GPS coordinates
 *
 * Formula: d = 2R * arcsin(sqrt(sin²(Δlat/2) + cos(lat1)*cos(lat2)*sin²(Δlng/2)))
 */

const EARTH_RADIUS_KM = 6371;
const METERS_PER_KM = 1000;

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1 (in degrees)
 * @param {number} lon1 - Longitude of point 1 (in degrees)
 * @param {number} lat2 - Latitude of point 2 (in degrees)
 * @param {number} lon2 - Longitude of point 2 (in degrees)
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) *
    Math.cos(lat1Rad) * Math.cos(lat2Rad);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distanceKm = EARTH_RADIUS_KM * c;
  return distanceKm * METERS_PER_KM;
}

/**
 * Check if a point is within a given radius
 * @param {number} targetLat - Target latitude
 * @param {number} targetLng - Target longitude
 * @param {number} userLat - User's latitude
 * @param {number} userLng - User's longitude
 * @param {number} radiusMeters - Radius in meters
 * @returns {{ isWithin: boolean, distanceMeters: number }}
 */
function isWithinRadius(targetLat, targetLng, userLat, userLng, radiusMeters) {
  const distance = haversineDistance(targetLat, targetLng, userLat, userLng);
  return {
    isWithin: distance <= radiusMeters,
    distanceMeters: Math.round(distance),
  };
}

module.exports = {
  haversineDistance,
  isWithinRadius,
  toRadians,
};
