export { AceBaseBaseSettings, AceBaseBase, AceBaseIndexes } from './acebase-base';
export { TypeMappings, TypeMappingOptions } from './type-mappings';
export { DataReference, DataRetrievalOptions } from './data-reference';
export { IStreamLike, IReflectionNodeInfo, IReflectionChildrenInfo } from './data-reference';
export { DataReferenceQuery, QueryDataRetrievalOptions, DataSnapshotsArray, DataReferencesArray} from './data-reference'; // TODO: move to data-reference-query
export { ILiveDataProxy, ILiveDataProxyValue, DataProxyOnChangeCallback, IObjectCollection, proxyAccess } from './data-proxy.d';
export { EventStream, EventSubscription } from './subscription';
export { DataSnapshot } from './data-snapshot';
export { PathInfo } from './path-info';
export { PathReference } from './path-reference';
export { ID } from './id';
export { DataIndex } from './acebase-base';
export { DebugLogger } from './debug';
export { SimpleCache } from './simple-cache';

// Newer typescript version:
// export * as Utils from './utils';
// export * as ascii85 from './ascii85';

// Older typescript versions:
import * as utils from './utils';
export interface Utils {
    cloneObject: typeof utils.cloneObject
    compareValues: typeof utils.compareValues
}
import * as ascii85 from './ascii85';
export interface ascii85 {
    encode: typeof ascii85.encode
    decode: typeof ascii85.decode
}

