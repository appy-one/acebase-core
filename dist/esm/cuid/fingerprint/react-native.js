import pad from '../pad.js';
const globalCount = Object.keys(global).length;
const clientId = pad(globalCount.toString(36), 4);
export default function fingerprint() {
    return clientId;
}
//# sourceMappingURL=react-native.js.map