import pad from '../pad';

const globalCount = Object.keys(global).length;
const clientId = pad(globalCount.toString(36), 4);

export default function fingerprint () {
  return clientId;
}
