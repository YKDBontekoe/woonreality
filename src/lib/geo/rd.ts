/** Convert Dutch Rijksdriehoek (EPSG:28992) coordinates to WGS84. */
export function rdToWgs84(x: number, y: number) {
  const dX = (x - 155000) / 100000;
  const dY = (y - 463000) / 100000;
  const latSeconds = 3235.65389 * dY
    - 0.2475 * dX ** 2
    - 0.84978 * dY ** 2
    - 0.0655 * dX ** 2 * dY
    + 0.0054 * dX * dY ** 2
    - 0.0006 * dX ** 4
    - 0.0012 * dX ** 2 * dY ** 2
    - 0.0003 * dX ** 4 * dY
    + 0.0001 * dX ** 2 * dY ** 3
    + 0.0003 * dX ** 6
    + 0.0001 * dX ** 4 * dY ** 2
    + 0.0001 * dX ** 6 * dY ** 2;
  const lonSeconds = 5260.52916 * dX
    + 105.94684 * dX * dY
    + 2.45656 * dX * dY ** 2
    - 0.81885 * dX ** 3
    + 0.05594 * dX ** 3 * dY
    - 0.05607 * dX ** 5
    + 0.01199 * dY ** 3
    - 0.00256 * dX ** 3 * dY ** 2
    + 0.00128 * dX * dY ** 3
    + 0.00022 * dY ** 2
    - 0.00022 * dX ** 4
    - 0.00001 * dX ** 4 * dY
    + 0.00001 * dX ** 6;
  return { lat: 52.1551744 + latSeconds / 3600, lng: 5.38720621 + lonSeconds / 3600 };
}

/** Convert WGS84 to Dutch Rijksdriehoek (EPSG:28992). */
export function wgs84ToRd(lat: number, lng: number) {
  const dLat = 0.36 * (lat - 52.1551744);
  const dLng = 0.36 * (lng - 5.38720621);
  const x = 155000
    + 190094.945 * dLng
    - 0.0083885 * dLat ** 2
    - 0.000022 * dLng ** 2
    + 0.000011 * dLat ** 2 * dLng
    - 0.000001 * dLng ** 3
    - 0.00000002 * dLat ** 4
    + 0.00000002 * dLat ** 2 * dLng ** 2
    + 0.00000001 * dLng ** 4;
  const y = 463000
    + 309056.544 * dLat
    + 3638.893 * dLng ** 2
    - 73.077 * dLat ** 2
    - 157.984 * dLat * dLng ** 2
    + 59.788 * dLat ** 3
    + 0.433 * dLng ** 4
    - 0.012 * dLat ** 2 * dLng ** 2
    + 0.0007 * dLat * dLng ** 4;
  return { x, y };
}
