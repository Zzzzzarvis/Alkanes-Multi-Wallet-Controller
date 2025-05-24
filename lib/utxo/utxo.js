"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectUtxos = exports.accountUtxos = exports.addressUtxos = exports.addressBalance = exports.accountBalance = void 0;
const tslib_1 = require("tslib");
const tiny_async_pool_1 = tslib_1.__importDefault(require("tiny-async-pool"));
const utils_1 = require("../shared/utils");
const accountBalance = async ({ account, provider, }) => {
    let confirmedAmount = 0;
    let pendingAmount = 0;
    let amount = 0;
    for (let i = 0; i < account.spendStrategy.addressOrder.length; i++) {
        const address = account[account.spendStrategy.addressOrder[i]].address;
        const { chain_stats, mempool_stats } = await provider.esplora._call('esplora_address', [address]);
        const btcBalance = chain_stats.funded_txo_sum - chain_stats.spent_txo_sum;
        const pendingBtcBalance = mempool_stats.funded_txo_sum - mempool_stats.spent_txo_sum;
        confirmedAmount += btcBalance;
        pendingAmount += pendingBtcBalance;
        amount += btcBalance + pendingAmount;
    }
    return {
        confirmedAmount: Math.floor(confirmedAmount / 10 ** 8),
        pendingAmount: Math.floor(pendingAmount / 10 ** 8),
        amount: Math.floor(amount / 10 ** 8),
    };
};
exports.accountBalance = accountBalance;
const addressBalance = async ({ address, provider, }) => {
    let confirmedAmount = 0;
    let pendingAmount = 0;
    let amount = 0;
    const { chain_stats, mempool_stats } = await provider.esplora._call('esplora_address', [address]);
    const btcBalance = chain_stats.funded_txo_sum - chain_stats.spent_txo_sum;
    const pendingBtcBalance = mempool_stats.funded_txo_sum - mempool_stats.spent_txo_sum;
    confirmedAmount += btcBalance;
    pendingAmount += pendingBtcBalance;
    amount += btcBalance + pendingAmount;
    return {
        confirmedAmount: confirmedAmount / 10 ** 8,
        pendingAmount: pendingAmount / 10 ** 8,
        amount: amount / 10 ** 8,
    };
};
exports.addressBalance = addressBalance;
const addressUtxos = async ({ address, provider, spendStrategy, }) => {
    let spendableTotalBalance = 0;
    let pendingTotalBalance = 0;
    let totalBalance = 0;
    const spendableUtxos = [];
    const pendingUtxos = [];
    const ordUtxos = [];
    const runeUtxos = [];
    const multiCall = await provider.sandshrew.multiCall([
        ['esplora_address::utxo', [address]],
        ['btc_getblockcount', []],
    ]);
    const blockCount = multiCall[1].result;
    let utxos = multiCall[0].result;
    if (utxos.length === 0) {
        return {
            spendableTotalBalance,
            spendableUtxos,
            runeUtxos,
            ordUtxos,
            pendingUtxos,
            pendingTotalBalance,
            totalBalance,
        };
    }
    const concurrencyLimit = 100;
    const processedUtxos = [];
    const processUtxo = async (utxo) => {
        try {
            const txIdVout = `${utxo.txid}:${utxo.vout}`;
            const [txOutput, txDetails] = await Promise.all([
                provider.ord.getTxOutput(txIdVout),
                provider.esplora.getTxInfo(utxo.txid),
            ]);
            return {
                utxo,
                txOutput,
                scriptPk: txDetails.vout[utxo.vout].scriptpubkey,
            };
        }
        catch (error) {
            console.error(`Error processing UTXO ${utxo.txid}:${utxo.vout}`, error);
            return null;
        }
    };
    for await (const result of (0, tiny_async_pool_1.default)(concurrencyLimit, utxos, processUtxo)) {
        if (result !== null) {
            processedUtxos.push(result);
        }
    }
    const alkanes = await provider.alkanes.getAlkanesByAddress({
        address,
    });
    const filteredProcessedUtxos = processedUtxos.filter(({ utxo }) => {
        return !alkanes.some((alkane) => alkane.outpoint.txid === utxo.txid && alkane.outpoint.vout === utxo.vout);
    });
    const utxoSortGreatestToLeast = spendStrategy?.utxoSortGreatestToLeast ?? true;
    filteredProcessedUtxos.sort((a, b) => utxoSortGreatestToLeast
        ? b.utxo.value - a.utxo.value
        : a.utxo.value - b.utxo.value);
    for (const { utxo, txOutput, scriptPk } of filteredProcessedUtxos) {
        totalBalance += utxo.value;
        if (txOutput.indexed) {
            const hasInscriptions = txOutput.inscriptions.length > 0;
            const hasRunes = Object.keys(txOutput.runes).length > 0;
            const confirmations = blockCount - utxo.status.block_height;
            if (hasRunes) {
                runeUtxos.push({
                    txId: utxo.txid,
                    outputIndex: utxo.vout,
                    satoshis: utxo.value,
                    address: address,
                    inscriptions: [],
                    confirmations,
                    scriptPk,
                });
            }
            if (hasInscriptions) {
                ordUtxos.push({
                    txId: utxo.txid,
                    outputIndex: utxo.vout,
                    satoshis: utxo.value,
                    address: address,
                    inscriptions: txOutput.inscriptions,
                    confirmations,
                    scriptPk,
                });
            }
            if (!hasInscriptions && !hasRunes) {
                spendableUtxos.push({
                    txId: utxo.txid,
                    outputIndex: utxo.vout,
                    satoshis: utxo.value,
                    address: address,
                    inscriptions: [],
                    confirmations,
                    scriptPk,
                });
                spendableTotalBalance += utxo.value;
            }
        }
        if (!utxo.status.confirmed) {
            pendingUtxos.push({
                txId: utxo.txid,
                outputIndex: utxo.vout,
                satoshis: utxo.value,
                address: address,
                inscriptions: [],
                confirmations: 0,
                scriptPk,
            });
            pendingTotalBalance += utxo.value;
        }
    }
    return {
        spendableTotalBalance,
        spendableUtxos,
        runeUtxos,
        ordUtxos,
        pendingUtxos,
        pendingTotalBalance,
        totalBalance,
    };
};
exports.addressUtxos = addressUtxos;
const accountUtxos = async ({ account, provider, }) => {
    let accountSpendableTotalUtxos = [];
    let accountSpendableTotalBalance = 0;
    let accountPendingTotalBalance = 0;
    let accountTotalBalance = 0;
    const accounts = {};
    const addresses = [
        { addressKey: 'nativeSegwit', address: account.nativeSegwit.address },
        { addressKey: 'nestedSegwit', address: account.nestedSegwit.address },
        { addressKey: 'taproot', address: account.taproot.address },
        { addressKey: 'legacy', address: account.legacy.address },
    ];
    for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i].address;
        const addressKey = addresses[i].addressKey;
        const { spendableTotalBalance, spendableUtxos, runeUtxos, ordUtxos, pendingUtxos, pendingTotalBalance, totalBalance, } = await (0, exports.addressUtxos)({
            address,
            provider,
        });
        accountSpendableTotalBalance += spendableTotalBalance;
        accountSpendableTotalUtxos.push(...spendableUtxos);
        accountPendingTotalBalance += pendingTotalBalance;
        accountTotalBalance += totalBalance;
        accounts[addressKey] = {
            spendableTotalBalance,
            spendableUtxos,
            runeUtxos,
            ordUtxos,
            pendingUtxos,
            pendingTotalBalance,
            totalBalance,
        };
    }
    return {
        accountTotalBalance,
        accountSpendableTotalUtxos,
        accountSpendableTotalBalance,
        accountPendingTotalBalance,
        accounts,
    };
};
exports.accountUtxos = accountUtxos;
const selectUtxos = (utxos, spendStrategy) => {
    const addressMap = new Map();
    utxos.forEach((utxo) => {
        const addressKey = (0, utils_1.getAddressKey)(utxo.address);
        if (spendStrategy.addressOrder.includes(addressKey)) {
            if (!addressMap.has(addressKey)) {
                addressMap.set(addressKey, []);
            }
            addressMap.get(addressKey).push(utxo);
        }
    });
    return spendStrategy.addressOrder.flatMap((addressKey) => {
        const utxosForAddress = addressMap.get(addressKey) || [];
        return utxosForAddress.sort((a, b) => (spendStrategy.utxoSortGreatestToLeast ? b.satoshis : a.satoshis) -
            (spendStrategy.utxoSortGreatestToLeast ? a.satoshis : b.satoshis));
    });
};
exports.selectUtxos = selectUtxos;
//# sourceMappingURL=utxo.js.map