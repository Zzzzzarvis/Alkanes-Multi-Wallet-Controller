import { Provider } from '../provider/provider';
import { Account } from '../account/account';
import { Signer } from '../signer';
import { FormattedUtxo } from '../utxo';
export declare const createPsbt: ({ utxos, toAddress, amount, feeRate, account, provider, fee, enableRBF, }: {
    utxos: FormattedUtxo[];
    toAddress: string;
    feeRate: number;
    amount: number;
    account: Account;
    provider: Provider;
    fee?: number;
    enableRBF?: boolean;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const send: ({ utxos, toAddress, amount, feeRate, account, provider, signer, fee, enableRBF, }: {
    utxos: FormattedUtxo[];
    toAddress: string;
    amount: number;
    feeRate: number;
    account: Account;
    provider: Provider;
    signer: Signer;
    fee?: number;
    enableRBF?: boolean;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const actualFee: ({ utxos, toAddress, amount, feeRate, account, provider, signer, }: {
    utxos: FormattedUtxo[];
    toAddress: string;
    feeRate: number;
    amount: number;
    account: Account;
    provider: Provider;
    signer: Signer;
}) => Promise<{
    fee: number;
}>;
export declare const minimumFee: ({ taprootInputCount, nonTaprootInputCount, outputCount, }: {
    taprootInputCount: number;
    nonTaprootInputCount: number;
    outputCount: number;
}) => number;
export declare const bumpFee: ({ txid, newFeeRate, account, provider, signer, }: {
    txid: string;
    newFeeRate: number;
    account: Account;
    provider: Provider;
    signer: Signer;
}) => Promise<{
    originalTxId: string;
    newTxId: string;
    originalFeeRate: number;
    newFeeRate: number;
    success: boolean;
}>;
