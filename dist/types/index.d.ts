export { AceBaseBase, AceBaseBaseSettings } from './acebase-base';
export { Api, IStreamLike, EventSubscriptionSettings, EventSubscriptionCallback, ReflectionType, StreamReadFunction, StreamWriteFunction, TransactionLogFilter, Query, QueryOptions, QueryFilter, QueryOrder, IAceBaseSchemaInfo, ValueMutation, ValueChange, IReflectionNodeInfo, IReflectionChildrenInfo } from './api';
export { DataReference, DataReferenceQuery, DataRetrievalOptions, QueryDataRetrievalOptions, DataSnapshotsArray, DataReferencesArray, QueryOperator } from './data-reference';
export { DataSnapshot, MutationsDataSnapshot, IDataMutationsArray } from './data-snapshot';
export { ILiveDataProxy, ILiveDataProxyValue, DataProxyOnChangeCallback, proxyAccess, OrderedCollectionProxy } from './data-proxy';
export { DebugLogger, LoggingLevel } from './debug';
export { ID } from './id';
export { PathReference } from './path-reference';
export { EventStream, EventPublisher, EventSubscription } from './subscription';
export * as Transport from './transport';
export { TypeMappings, TypeMappingOptions } from './type-mappings';
export * as Utils from './utils';
export { PathInfo } from './path-info';
export { ascii85 } from './ascii85';
export { SimpleCache } from './simple-cache';
export { SimpleEventEmitter } from './simple-event-emitter';
export { ColorStyle, Colorize } from './simple-colors';
export { SchemaDefinition, ISchemaCheckResult } from './schema';
export { IObservableLike, SimpleObservable } from './simple-observable';
export { PartialArray } from './partial-array';
import { ObjectCollection } from './object-collection';
/**
 * Legacy (deprecated) IObjectCollection
 * @deprecated Use `ObjectCollection` instead
 */
export type IObjectCollection<T> = ObjectCollection<T>;
export { ObjectCollection };
//# sourceMappingURL=index.d.ts.map