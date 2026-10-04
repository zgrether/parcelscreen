/** A WGS84 point as the prototype passes it around: [latitude, longitude] in degrees. */
export type LatLon = [lat: number, lon: number];

/** Square metres per acre and feet per metre (prototype constants, proto L469). */
export const M2_PER_ACRE = 4046.86;
export const M2FT = 3.28084;
