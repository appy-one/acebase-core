export default {
    // eslint-disable-next-line @typescript-eslint/ban-types
    nextTick(fn: Function) {
        setTimeout(fn, 0);
    },
};
