export default function pad (num: string, size: number) {
    const s = '000000000' + num;
    return s.substr(s.length - size);
}
