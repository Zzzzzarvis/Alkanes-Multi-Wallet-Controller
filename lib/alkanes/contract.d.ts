/// <reference types="node" />
/// <reference types="node" />
import { Account, Signer, Provider } from '..';
import { AlkanesPayload, GatheredUtxos } from '../shared/interface';
export declare const contractDeployment: ({ payload, gatheredUtxos, account, protostone, provider, feeRate, signer, }: {
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
export declare const actualDeployCommitFee: ({ payload, tweakedPublicKey, gatheredUtxos, account, provider, feeRate, }: {
    payload: AlkanesPayload;
    tweakedPublicKey: string;
    gatheredUtxos: GatheredUtxos;
    account: Account;
    provider: Provider;
    feeRate?: number;
}) => Promise<{
    fee: number;
    vsize: number;
}>;
export declare const actualDeployRevealFee: ({ protostone, tweakedPublicKey, commitTxId, receiverAddress, script, provider, feeRate, }: {
    protostone: Buffer;
    tweakedPublicKey: string;
    commitTxId: string;
    receiverAddress: string;
    script: Buffer;
    provider: Provider;
    feeRate?: number;
}) => Promise<{
    fee: number;
    vsize: number;
}>;
export declare const deployReveal: ({ protostone, commitTxId, script, account, provider, feeRate, signer, }: {
    protostone: Buffer;
    commitTxId: string;
    script: string;
    account: Account;
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
