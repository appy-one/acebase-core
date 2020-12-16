import pad from '../pad';

const env = typeof window === 'object' ? window : self,
  globalCount = Object.keys(env).length,
  mimeTypesLength = navigator.mimeTypes ? navigator.mimeTypes.length : 0,
  clientId = pad((mimeTypesLength +
    navigator.userAgent.length).toString(36) +
    globalCount.toString(36), 4);

export default function fingerprint () {
  return clientId;
}
