/// <reference types="node" />
/// <reference types="node" />
import { Account, Signer, Provider } from '..';
import { AlkaneId, AlkanesPayload, GatheredUtxos } from '../shared/interface';
export declare const tokenDeployment: ({ payload, gatheredUtxos, account, protostone, provider, feeRate, signer, }: {
    payload: AlkanesPayload;
    gatheredUtxos: GatheredUtxos;
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    commitTx: string;
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const createSendPsbt: ({ gatheredUtxos, account, alkaneId, provider, toAddress, amount, feeRate, fee, }: {
    gatheredUtxos: GatheredUtxos;
    account: Account;
    alkaneId: {
        block: string;
        tx: string;
    };
    provider: Provider;
    toAddress: string;
    amount: number;
    feeRate?: number;
    fee?: number;
}) => Promise<{
    psbt: string;
}>;
export declare const send: ({ gatheredUtxos, toAddress, amount, alkaneId, feeRate, account, provider, signer, }: {
    gatheredUtxos: GatheredUtxos;
    toAddress: string;
    amount: number;
    alkaneId: AlkaneId;
    feeRate?: number;
    account: Account;
    provider: Provider;
    signer: Signer;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const actualSendFee: ({ gatheredUtxos, account, alkaneId, provider, toAddress, amount, feeRate, }: {
    gatheredUtxos: GatheredUtxos;
    account: Account;
    alkaneId: {
        block: string;
        tx: string;
    };
    provider: Provider;
    toAddress: string;
    amount: number;
    feeRate?: number;
}) => Promise<{
    fee: number;
    vsize: number;
}>;
export declare const split: ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, signer, }: {
    alkaneUtxos?: {
        alkaneUtxos: any[];
        totalSatoshis: number;
    };
    gatheredUtxos: GatheredUtxos;
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const createSplitPsbt: ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, fee, }: {
    alkaneUtxos?: {
        alkaneUtxos: any[];
        totalSatoshis: number;
    };
    gatheredUtxos: GatheredUtxos;
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate?: number;
    fee?: number;
}) => Promise<{
    psbt: string;
    psbtHex: string;
}>;
export declare const actualSplitFee: ({ gatheredUtxos, account, protostone, provider, feeRate, signer, alkaneUtxos, }: {
    gatheredUtxos: GatheredUtxos;
    account: Account;
    protostone: Buffer;
    provider: Provider;
    feeRate: number;
    signer: Signer;
    alkaneUtxos?: {
        alkaneUtxos: any[];
        totalSatoshis: number;
    };
}) => Promise<{
    fee: number;
}>;
