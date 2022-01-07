export { AceBaseBaseSettings, AceBaseBase, AceBaseIndexes } from './acebase-base';
export { TypeMappings, TypeMappingOptions } from './type-mappings';
export { DataReference, DataRetrievalOptions } from './data-reference';
export { IStreamLike, IReflectionNodeInfo, IReflectionChildrenInfo } from './data-reference';
export { DataReferenceQuery, QueryDataRetrievalOptions, DataSnapshotsArray, DataReferencesArray} from './data-reference'; // TODO: move to data-reference-query
export { ILiveDataProxy, ILiveDataProxyValue, DataProxyOnChangeCallback, proxyAccess, OrderedCollectionProxy } from './data-proxy';
export { IObjectCollection, ObjectCollection } from './object-collection';
export { EventStream, EventSubscription } from './subscription';
export { Transport } from './transport';
export { DataSnapshot, MutationsDataSnapshot } from './data-snapshot';
export { PathInfo } from './path-info';
export { PathReference } from './path-reference';
export { ID } from './id';
export { DataIndex } from './acebase-base';
export { DebugLogger } from './debug';
export { SimpleCache } from './simple-cache';
export { IObservableLike } from './optional-observable';
export { PartialArray } from './partial-array';

// Newer typescript version:
// export * as Utils from './utils';
// export * as ascii85 from './ascii85';

// Older typescript versions:
import * as _utils from './utils';
export class Utils {
    static cloneObject: typeof _utils.cloneObject
    static compareValues: typeof _utils.compareValues
    static defer: typeof _utils.defer
}
import * as _ascii85 from './ascii85';
export class ascii85 {
    static encode: typeof _ascii85.encode
    static decode: typeof _ascii85.decode
}

// New, for smaller bundles & less dependencies:
export { SimpleEventEmitter } from './simple-event-emitter';
export { ColorStyle, Colorize } from './simple-colors';

export { SchemaDefinition, ISchemaCheckResult } from './schema';