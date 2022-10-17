/**
 * New cuid generator using high resolution timestamps with performance.timeOrigin and performance.now().
 * It also uses radix 62 (0-9, a-z, A-Z) alphabet: less characters needed for larger numbers
 * breakdown:
 * 'c' ttttttt nnnn ccc ffff rrrrrr
 * t = milliseconds (7 bytes)
 * n = nanoseconds (4 bytes)
 * c = counter (3 bytes)
 * f = fingerprint (4 bytes)
 * r = random (6 bytes)
 * @param timebias
 * @returns a high resolution cuid
 */
export default function cuid(timebias?: number): string;
