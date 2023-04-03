// import { DataReference } from './data-reference.js';
describe('DataReference', () => {
    it('type checks', async () => {
        // (this is not a unit test)
        // Use this to perform DataReference typechecks,
        // commented out to prevent TSC errors and warnings
        // const ref = new DataReference<{ prop1: boolean; prop2: string; prop3: { sub1: string; sub2: boolean } }>(null, 'test');
        // const snap = await ref.get();
        // const val = snap.val();
        // let boolean = val.prop1; // TSC: boolean
        // let string = val.prop2; // TSC: string
        // string = val.prop3.sub1; // TSC: string
        // boolean = val.prop3.sub2; // TSC: boolean
        // ref.set({ prop2: 'Hallo' }); // TSC: error
        // ref.update({ prop2: 'Hallo' }); // TSC: ok
        // boolean = snap.child('prop3').val().sub2; // TSC: boolean
        // const anything = snap.child('prop/prop2').val().blah; // TSC: any
        // snap.forEach((child) => {
        //     const val = child.val(); // TSC: Type is T[keyof T]
        //     return true;
        // });
    });
});
//# sourceMappingURL=data-reference.spec.js.map