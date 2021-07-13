import fingerprint from './fingerprint';
import legacy_cuid from './index';
import performance from './performance';

var c = 0,
  blockSize = 4,
  base = 62,
  discreteValues = Math.pow(base, blockSize);

function randomBlock () {
  return toRadix62(Math.random() * discreteValues << 0).padStart(blockSize, '0');
}

function safeCounter () {
  c = c < discreteValues ? c : 0;
  c++; // this is not subliminal
  return c - 1;
}

const radix62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function toRadix62(nr: number) {
  const decimals = nr % 1;
  if (decimals > 0) {
    nr = Math.floor(nr);
  }
  const base = radix62.length;
  let conversion = '';
  while (nr >= 1) {
    conversion = radix62[(nr - (base * Math.floor(nr / base)))] + conversion;
    nr = Math.floor(nr / base);
  }
  if (decimals > 0) {
    conversion += '.' + Math.floor(decimals * 1000);
  }
  return conversion;
}

/**
 * New cuid generator using high resolution timestamps with performance.timeOrigin and performance.now().
 * It also uses radix 62 (0-9, a-z, A-Z) alphabet
 * @param timebias 
 * @returns 
 */
export default function cuid (timebias: number = 0) {
  if (typeof performance === 'undefined') {
    return legacy_cuid(timebias);
  }
  // Starting with a lowercase letter makes
  // it HTML element ID friendly.
  var letter = 'c', // hard-coded allows for sequential access

    // timestamp
    // warning: this exposes the exact date and time
    // that the uid was created.
    // NOTES Ewout: 
    // - added timebias
    // - at '2081/08/05 12:16:46.208', timestamp will become 1 character larger!
    timestamp = toRadix62(performance.timeOrigin + performance.now() + timebias).replace('.', '').padEnd(10, '0'),

    // Prevent same-machine collisions. Allows for 3844 IDs in the same microsecond
    counter = toRadix62(safeCounter()).padStart(2, '0'),

    // A few chars to generate distinct ids for different
    // clients (so different computers are far less
    // likely to generate the same id)
    print = fingerprint(),

    // Grab some more chars from Math.random()
    random = randomBlock() + randomBlock();

  return letter + timestamp + counter + print + random;
}

