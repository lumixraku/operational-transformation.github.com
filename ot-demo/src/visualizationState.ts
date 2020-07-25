import {TextOperation} from "ot";

export type Queue<A> = A[];

export interface Operation {
    textOperation: TextOperation;
    key: string;
}

export interface OperationAndRevision extends Operation {
    revision: number; // non-negative integer
}

export interface ServerVisualizationState {
    operations: Operation[];
    text: string;
}

export enum ClientStateStatus {
    SYNCHRONIZED = "SYNCHRONIZED",
    AWAITING_ACK = "AWAITING_ACK",
    AWAITING_ACK_WITH_OPERATION = "AWAITING_ACK_WITH_OPERATION",
}

interface BaseSynchronizationState {
    serverRevision: number; // non-negative integer
}

interface SynchronizationStateSynchronized extends BaseSynchronizationState {
    status: ClientStateStatus.SYNCHRONIZED,
}

interface SynchronizationStateAwaitingAck extends BaseSynchronizationState {
    status: ClientStateStatus.AWAITING_ACK,
    expectedOperation: TextOperation;
}

interface SynchronizationStateAwaitingAckWithOperation extends BaseSynchronizationState {
    status: ClientStateStatus.AWAITING_ACK_WITH_OPERATION,
    expectedOperation: TextOperation;
    buffer: TextOperation;
}

export type SynchronizationState =
    SynchronizationStateSynchronized
    | SynchronizationStateAwaitingAck
    | SynchronizationStateAwaitingAckWithOperation;

export interface ClientAndSocketsVisualizationState {
    toServer: Queue<OperationAndRevision>;
    fromServer: Queue<Operation>;
    synchronizationState: SynchronizationState;
    text: string;
}

export interface VisualizationState {
    server: ServerVisualizationState;
    alice: ClientAndSocketsVisualizationState;
    bob: ClientAndSocketsVisualizationState;
}

function receiveOperationFromClient(server: ServerVisualizationState, operation: OperationAndRevision): ({
    newServer: ServerVisualizationState,
    operationToBroadcast: Operation,
}) {
    const concurrentOperations = server.operations.slice(operation.revision);

    const transformedTextOperation = concurrentOperations.reduce((op, concurrentOp) => TextOperation.transform(op, concurrentOp.textOperation), operation.textOperation);

    const operationToBroadcast: Operation = {
        key: operation.key,
        textOperation: transformedTextOperation,
    }
    const newServer: ServerVisualizationState = {
        operations: [...server.operations, operationToBroadcast],
        text: transformedTextOperation.apply(server.text),
    }
    return {operationToBroadcast, newServer};
}

function processClientUserOperation(synchronizationState: SynchronizationState, textOperation: TextOperation, clientName: string): ({
    newSynchronizationState: SynchronizationState,
    operationsToSendToServer: OperationAndRevision[],
}) {
    switch (synchronizationState.status) {
        case ClientStateStatus.SYNCHRONIZED:
            const revision = synchronizationState.serverRevision + 1;
            return {
                newSynchronizationState: {
                    status: ClientStateStatus.AWAITING_ACK,
                    serverRevision: synchronizationState.serverRevision,
                    expectedOperation: textOperation,
                },
                operationsToSendToServer: [{revision, textOperation, key: `${clientName}-${revision}`}],
            };
        case ClientStateStatus.AWAITING_ACK:
            return {
                newSynchronizationState: {
                    status: ClientStateStatus.AWAITING_ACK_WITH_OPERATION,
                    serverRevision: synchronizationState.serverRevision,
                    expectedOperation: synchronizationState.expectedOperation,
                    buffer: textOperation,
                },
                operationsToSendToServer: [],
            };
        case ClientStateStatus.AWAITING_ACK_WITH_OPERATION:
            return {
                newSynchronizationState: {
                    status: ClientStateStatus.AWAITING_ACK_WITH_OPERATION,
                    serverRevision: synchronizationState.serverRevision,
                    expectedOperation: synchronizationState.expectedOperation,
                    buffer: synchronizationState.buffer.compose(textOperation),
                },
                operationsToSendToServer: [],
            };
    }
}

export function clientUserOperation(client: ClientAndSocketsVisualizationState, operation: TextOperation, clientName: string): ClientAndSocketsVisualizationState {
    const {newSynchronizationState, operationsToSendToServer} = processClientUserOperation(client.synchronizationState, operation, clientName);

    return {
        synchronizationState: newSynchronizationState,
        toServer: [...client.toServer, ...operationsToSendToServer],
        fromServer: client.fromServer,
        text: operation.apply(client.text),
    };
}

export interface Lens<S, A> {
    get: (s: S) => A;
    set: (s: S, a: A) => S;
}

export const aliceLens: Lens<VisualizationState, ClientAndSocketsVisualizationState> = {
    get: (globalState) => globalState.alice,
    set: (globalState, aliceState) => ({...globalState, alice: aliceState}),
};

export const bobLens: Lens<VisualizationState, ClientAndSocketsVisualizationState> = {
    get: (globalState) => globalState.bob,
    set: (globalState, bobState) => ({...globalState, bob: bobState}),
};