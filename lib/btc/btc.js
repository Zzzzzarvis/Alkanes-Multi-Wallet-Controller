"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bumpFee = exports.minimumFee = exports.actualFee = exports.send = exports.createPsbt = void 0;
const tslib_1 = require("tslib");
const errors_1 = require("../errors");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const utils_1 = require("../shared/utils");
const utils_2 = require("../shared/utils");
const createPsbt = async ({ utxos, toAddress, amount, feeRate, account, provider, fee, enableRBF = true, }) => {
    try {
        if (!utxos?.length) {
            throw new Error('No utxos provided');
        }
        if (!feeRate) {
            throw new Error('No feeRate provided');
        }
        const minTxSize = (0, exports.minimumFee)({
            taprootInputCount: 1,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        let calculatedFee = Math.max(minTxSize * feeRate, 250);
        let finalFee = fee ?? calculatedFee;
        let gatheredUtxos = (0, utils_1.findXAmountOfSats)(utxos, Number(finalFee) + Number(amount));
        if (!fee && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, exports.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = Math.max(txSize * feeRate, 250);
            gatheredUtxos = (0, utils_1.findXAmountOfSats)(utxos, Number(finalFee) + Number(amount));
        }
        if (gatheredUtxos.totalAmount < Number(finalFee) + Number(amount)) {
            throw new Error('Insufficient Balance');
        }
        const psbt = new bitcoin.Psbt({
            network: provider.network,
        });
        const rbfSequence = enableRBF ? 0xfffffffe : 0xffffffff;
        for (let i = 0; i < gatheredUtxos.utxos.length; i++) {
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(gatheredUtxos.utxos[i].txId);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                    sequence: rbfSequence,
                });
            }
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 2) {
                const redeemScript = bitcoin.script.compile([
                    bitcoin.opcodes.OP_0,
                    bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                ]);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    redeemScript: redeemScript,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: bitcoin.script.compile([
                            bitcoin.opcodes.OP_HASH160,
                            bitcoin.crypto.hash160(redeemScript),
                            bitcoin.opcodes.OP_EQUAL,
                        ]),
                    },
                    sequence: rbfSequence,
                });
            }
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 1 ||
                (0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 3) {
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: Buffer.from(gatheredUtxos.utxos[i].scriptPk, 'hex'),
                    },
                    sequence: rbfSequence,
                });
            }
        }
        psbt.addOutput({
            address: toAddress,
            value: Number(amount),
        });
        const changeAmount = gatheredUtxos.totalAmount - (finalFee + Number(amount));
        if (changeAmount > 295) {
            psbt.addOutput({
                address: account[account.spendStrategy.changeAddress].address,
                value: changeAmount,
            });
        }
        const updatedPsbt = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return { psbt: updatedPsbt.toBase64(), fee: finalFee };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createPsbt = createPsbt;
const send = async ({ utxos, toAddress, amount, feeRate, account, provider, signer, fee, enableRBF = true, }) => {
    if (!fee) {
        fee = (await (0, exports.actualFee)({
            utxos,
            toAddress,
            amount,
            feeRate,
            account,
            provider,
            signer,
        })).fee;
    }
    const { psbt: finalPsbt } = await (0, exports.createPsbt)({
        utxos,
        toAddress,
        amount,
        feeRate,
        fee,
        account,
        provider,
        enableRBF,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    const result = await provider.pushPsbt({
        psbtBase64: signedPsbt,
    });
    return result;
};
exports.send = send;
const actualFee = async ({ utxos, toAddress, amount, feeRate, account, provider, signer, }) => {
    const { psbt } = await (0, exports.createPsbt)({
        utxos,
        toAddress: toAddress,
        amount: amount,
        feeRate: feeRate,
        account: account,
        provider: provider,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: psbt,
        finalize: true,
    });
    let rawPsbt = bitcoin.Psbt.fromBase64(signedPsbt, {
        network: account.network,
    });
    const signedHexPsbt = rawPsbt.extractTransaction().toHex();
    const vsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([signedHexPsbt]))[0].vsize;
    const correctFee = vsize * feeRate;
    const { psbt: finalPsbt } = await (0, exports.createPsbt)({
        utxos,
        toAddress: toAddress,
        amount: amount,
        feeRate: feeRate,
        fee: correctFee,
        account: account,
        provider: provider,
    });
    const { signedPsbt: signedAll } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    let finalRawPsbt = bitcoin.Psbt.fromBase64(signedAll, {
        network: account.network,
    });
    const finalSignedHexPsbt = finalRawPsbt.extractTransaction().toHex();
    const finalVsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalSignedHexPsbt]))[0].vsize;
    const finalFee = finalVsize * feeRate;
    return { fee: finalFee };
};
exports.actualFee = actualFee;
const minimumFee = ({ taprootInputCount, nonTaprootInputCount, outputCount, }) => {
    return (0, utils_1.calculateTaprootTxSize)(taprootInputCount, nonTaprootInputCount, outputCount);
};
exports.minimumFee = minimumFee;
const bumpFee = async ({ txid, newFeeRate, account, provider, signer, }) => {
    try {
        const txInfo = await provider.esplora.getTxInfo(txid);
        if (!txInfo) {
            throw new Error('Transaction not found');
        }
        if (txInfo.status.confirmed) {
            throw new Error('Transaction is already confirmed and cannot be replaced');
        }
        const hasRBF = txInfo.vin.some(input => {
            return input.sequence < 0xffffffff - 1;
        });
        if (!hasRBF) {
            throw new Error('Transaction does not have RBF enabled');
        }
        const inputs = [];
        const utxos = [];
        for (const input of txInfo.vin) {
            const prevTx = await provider.esplora.getTxInfo(input.txid);
            if (!prevTx) {
                throw new Error(`Previous transaction not found: ${input.txid}`);
            }
            const prevOutput = prevTx.vout[input.vout];
            utxos.push({
                txId: input.txid,
                outputIndex: input.vout,
                satoshis: Math.round(prevOutput.value * 100000000),
                scriptPk: prevOutput.scriptpubkey,
                address: prevOutput.scriptpubkey_address,
            });
        }
        const outputs = txInfo.vout.map(output => ({
            address: output.scriptpubkey_address,
            value: Math.round(output.value * 100000000),
        }));
        const originalFee = txInfo.fee;
        const { psbt } = await (0, exports.createPsbt)({
            utxos: utxos,
            toAddress: outputs[0].address,
            amount: outputs[0].value,
            feeRate: newFeeRate,
            account,
            provider,
            enableRBF: true,
        });
        const { signedPsbt } = await signer.signAllInputs({
            rawPsbt: psbt,
            finalize: true,
        });
        const result = await provider.pushPsbt({
            psbtBase64: signedPsbt,
        });
        return {
            originalTxId: txid,
            newTxId: result.txId,
            originalFeeRate: originalFee / (txInfo.weight / 4),
            newFeeRate: newFeeRate,
            success: true,
        };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.bumpFee = bumpFee;
//# sourceMappingURL=btc.js.map