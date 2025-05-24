"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bumpFee = exports.createTransactReveal = exports.execute = exports.executePsbt = exports.actualExecuteFee = exports.actualTransactRevealFee = exports.findAlkaneUtxos = exports.deployReveal = exports.createDeployRevealPsbt = exports.deployCommit = exports.createDeployCommitPsbt = exports.createExecutePsbt = void 0;
const tslib_1 = require("tslib");
const btc_1 = require("../btc");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const index_1 = require("alkanes/lib/index");
const utils_1 = require("../shared/utils");
const psbt_1 = require("../psbt");
const errors_1 = require("../errors");
const utils_2 = require("../shared/utils");
const bip371_1 = require("bitcoinjs-lib/src/psbt/bip371");
const bip341_1 = require("bitcoinjs-lib/src/payments/bip341");
const contract_1 = require("./contract");
const createExecutePsbt = async ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, fee = 0, enableRBF = true, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        // 优化计算交易大小的方法，使其更符合实际情况
        const inputCount = gatheredUtxos.utxos.length + (alkaneUtxos ? alkaneUtxos.alkaneUtxos.length : 0);
        const outputCount = 3; // 通常为3个输出：目标地址、OP_RETURN以及找零地址
        // 优化txSize计算
        const witnessOverhead = 2 + inputCount; // 见证开销
        const baseSize = 4 + // 版本
            1 + // 输入数量变长整数（通常为1字节）
            inputCount * 40 + // 每个输入的大小（非见证部分）
            1 + // 输出数量变长整数（通常为1字节）
            outputCount * 34 + // 每个输出的大小
            4; // 锁定时间
        const witnessSize = inputCount * 108; // 每个输入的见证数据大约108字节（签名+公钥）
        // vsize = (baseSize * 3 + totalSize) / 4
        const totalSize = baseSize + witnessSize + witnessOverhead;
        const vsize = Math.ceil((baseSize * 3 + totalSize) / 4);
        console.log(`估计交易大小 - baseSize: ${baseSize}, witnessSize: ${witnessSize}, vsize: ${vsize}`);
        // 使用vsize计算手续费，确保手续费计算更准确
        let calculatedFee = Math.max(Math.ceil(vsize * feeRate), 250);
        let finalFee = fee === 0 ? calculatedFee : fee;
        console.log(`计算的手续费: ${calculatedFee} satoshis, 费率: ${feeRate} sat/vB, 最终手续费: ${finalFee} satoshis`);
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + 546);
        let psbt = new bitcoin.Psbt({ network: provider.network });
        const rbfSequence = enableRBF ? 0xfffffffd : 0xffffffff;
        console.log(`使用序列号: ${rbfSequence.toString(16)} (十六进制)`);
        if (alkaneUtxos) {
            for await (const utxo of alkaneUtxos.alkaneUtxos) {
                if ((0, utils_2.getAddressType)(utxo.address) === 0) {
                    const previousTxHex = await provider.esplora.getTxHex(utxo.txId);
                    psbt.addInput({
                        hash: utxo.txId,
                        index: parseInt(utxo.txIndex),
                        nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                        sequence: rbfSequence,
                    });
                }
                if ((0, utils_2.getAddressType)(utxo.address) === 2) {
                    const redeemScript = bitcoin.script.compile([
                        bitcoin.opcodes.OP_0,
                        bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                    ]);
                    psbt.addInput({
                        hash: utxo.txId,
                        index: parseInt(utxo.txIndex),
                        redeemScript: redeemScript,
                        witnessUtxo: {
                            value: utxo.satoshis,
                            script: bitcoin.script.compile([
                                bitcoin.opcodes.OP_HASH160,
                                bitcoin.crypto.hash160(redeemScript),
                                bitcoin.opcodes.OP_EQUAL,
                            ]),
                        },
                        sequence: rbfSequence,
                    });
                }
                if ((0, utils_2.getAddressType)(utxo.address) === 1 ||
                    (0, utils_2.getAddressType)(utxo.address) === 3) {
                    psbt.addInput({
                        hash: utxo.txId,
                        index: parseInt(utxo.txIndex),
                        witnessUtxo: {
                            value: utxo.satoshis,
                            script: Buffer.from(utxo.script, 'hex'),
                        },
                        sequence: rbfSequence,
                    });
                }
            }
        }
        if (fee === 0 && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = Math.ceil(txSize * feeRate) < 250 ? 250 : Math.ceil(txSize * feeRate);
            if (gatheredUtxos.totalAmount < finalFee) {
                throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
            }
        }
        if (gatheredUtxos.totalAmount < finalFee) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
        }
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
            address: account.taproot.address,
            value: 546,
        });
        const output = { script: protostone, value: 0 };
        psbt.addOutput(output);
        const changeAmount = Math.floor(gatheredUtxos.totalAmount +
            (alkaneUtxos?.totalSatoshis || 0) -
            finalFee -
            546);
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        const formattedPsbtTx = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return {
            psbt: formattedPsbtTx.toBase64(),
            psbtHex: formattedPsbtTx.toHex(),
        };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createExecutePsbt = createExecutePsbt;
const createDeployCommitPsbt = async ({ payload, gatheredUtxos, tweakedPublicKey, account, provider, feeRate, fee, enableRBF = true, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        const calculatedFee = Math.ceil(minFee * feeRate) < 250 ? 250 : Math.ceil(minFee * feeRate);
        let finalFee = fee ? fee : calculatedFee;
        let psbt = new bitcoin.Psbt({ network: provider.network });
        const rbfSequence = enableRBF ? 0xfffffffe : 0xffffffff;
        const script = Buffer.from((0, index_1.p2tr_ord_reveal)((0, bip371_1.toXOnly)(Buffer.from(tweakedPublicKey, 'hex')), [payload])
            .script);
        const inscriberInfo = bitcoin.payments.p2tr({
            internalPubkey: (0, bip371_1.toXOnly)(Buffer.from(tweakedPublicKey, 'hex')),
            scriptTree: {
                output: script,
            },
            network: provider.network,
        });
        const wasmDeploySize = Math.ceil((0, utils_1.getVSize)(Buffer.from(payload.body)) * feeRate);
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, wasmDeploySize + Number(utils_1.inscriptionSats) + finalFee * 2);
        if (!fee && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = Math.ceil(txSize * feeRate) < 250 ? 250 : Math.ceil(txSize * feeRate);
            if (gatheredUtxos.totalAmount < finalFee) {
                gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, wasmDeploySize + Number(utils_1.inscriptionSats) + finalFee * 2);
            }
        }
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
        if (gatheredUtxos.totalAmount <
            finalFee * 2 + utils_1.inscriptionSats + wasmDeploySize) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
        }
        psbt.addOutput({
            value: Math.ceil(finalFee + wasmDeploySize + 546),
            address: inscriberInfo.address,
        });
        const changeAmount = Math.floor(gatheredUtxos.totalAmount -
            (finalFee * 2 + wasmDeploySize + utils_1.inscriptionSats));
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        const formattedPsbtTx = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return { psbt: formattedPsbtTx.toBase64(), script };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createDeployCommitPsbt = createDeployCommitPsbt;
const deployCommit = async ({ payload, gatheredUtxos, account, provider, feeRate, signer, }) => {
    const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, {
        network: provider.network,
    });
    const tweakedPublicKey = tweakedTaprootKeyPair.publicKey.toString('hex');
    const { fee: commitFee } = await (0, contract_1.actualDeployCommitFee)({
        payload,
        gatheredUtxos,
        tweakedPublicKey,
        account,
        provider,
        feeRate,
    });
    const { psbt: finalPsbt, script } = await (0, exports.createDeployCommitPsbt)({
        payload,
        gatheredUtxos,
        tweakedPublicKey,
        account,
        provider,
        feeRate,
        fee: commitFee,
        enableRBF: true,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    const result = await provider.pushPsbt({
        psbtBase64: signedPsbt,
    });
    return { ...result, script: script.toString('hex') };
};
exports.deployCommit = deployCommit;
const createDeployRevealPsbt = async ({ protostone, receiverAddress, script, feeRate, tweakedPublicKey, provider, fee = 0, commitTxId, }) => {
    try {
        if (!feeRate) {
            feeRate = (await provider.esplora.getFeeEstimates())['1'];
        }
        const psbt = new bitcoin.Psbt({ network: provider.network });
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 1,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        const revealTxBaseFee = Math.ceil(minFee * feeRate) < 250 ? 250 : Math.ceil(minFee * feeRate);
        const revealTxChange = fee === 0 ? 0 : Math.floor(Number(revealTxBaseFee) - fee);
        const commitTxOutput = await (0, utils_1.getOutputValueByVOutIndex)({
            txId: commitTxId,
            vOut: 0,
            esploraRpc: provider.esplora,
        });
        if (!commitTxOutput) {
            throw new errors_1.OylTransactionError(new Error('Error getting vin #0 value'));
        }
        const p2pk_redeem = { output: script };
        const { output, witness } = bitcoin.payments.p2tr({
            internalPubkey: (0, bip371_1.toXOnly)(Buffer.from(tweakedPublicKey, 'hex')),
            scriptTree: p2pk_redeem,
            redeem: p2pk_redeem,
            network: provider.network,
        });
        psbt.addInput({
            hash: commitTxId,
            index: 0,
            witnessUtxo: {
                value: commitTxOutput.value,
                script: output,
            },
            tapLeafScript: [
                {
                    leafVersion: bip341_1.LEAF_VERSION_TAPSCRIPT,
                    script: p2pk_redeem.output,
                    controlBlock: witness[witness.length - 1],
                },
            ],
        });
        psbt.addOutput({
            value: 546,
            address: receiverAddress,
        });
        psbt.addOutput({
            value: 0,
            script: protostone,
        });
        if (revealTxChange > 546) {
            psbt.addOutput({
                value: Math.floor(revealTxChange),
                address: receiverAddress,
            });
        }
        return {
            psbt: psbt.toBase64(),
            fee: revealTxChange,
        };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createDeployRevealPsbt = createDeployRevealPsbt;
const deployReveal = async ({ protostone, commitTxId, script, account, provider, feeRate, signer, }) => {
    const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, {
        network: provider.network,
    });
    const tweakedPublicKey = tweakedTaprootKeyPair.publicKey.toString('hex');
    const { fee } = await (0, exports.actualTransactRevealFee)({
        protostone,
        tweakedPublicKey,
        receiverAddress: account.taproot.address,
        commitTxId,
        script: Buffer.from(script, 'hex'),
        provider,
        feeRate,
    });
    const { psbt: finalRevealPsbt } = await (0, exports.createTransactReveal)({
        protostone,
        tweakedPublicKey,
        receiverAddress: account.taproot.address,
        commitTxId,
        script: Buffer.from(script, 'hex'),
        provider,
        feeRate,
        fee,
    });
    let finalReveal = bitcoin.Psbt.fromBase64(finalRevealPsbt, {
        network: provider.network,
    });
    finalReveal.signInput(0, tweakedTaprootKeyPair);
    finalReveal.finalizeInput(0);
    const finalSignedPsbt = finalReveal.toBase64();
    const revealResult = await provider.pushPsbt({
        psbtBase64: finalSignedPsbt,
    });
    return revealResult;
};
exports.deployReveal = deployReveal;
const findAlkaneUtxos = async ({ address, greatestToLeast, provider, alkaneId, targetNumberOfAlkanes, }) => {
    const res = await provider.alkanes.getAlkanesByAddress({
        address: address,
        protocolTag: '1',
    });
    const matchingRunesWithOutpoints = res.flatMap((outpoint) => outpoint.runes
        .filter((value) => Number(value.rune.id.block) === Number(alkaneId.block) &&
        Number(value.rune.id.tx) === Number(alkaneId.tx))
        .map((rune) => ({ rune, outpoint })));
    const sortedRunesWithOutpoints = matchingRunesWithOutpoints.sort((a, b) => greatestToLeast
        ? Number(b.rune.balance) - Number(a.rune.balance)
        : Number(a.rune.balance) - Number(b.rune.balance));
    let totalSatoshis = 0;
    let totalBalanceBeingSent = 0;
    const alkaneUtxos = [];
    for (const alkane of sortedRunesWithOutpoints) {
        if (totalBalanceBeingSent < targetNumberOfAlkanes &&
            Number(alkane.rune.balance) > 0) {
            const satoshis = Number(alkane.outpoint.output.value);
            alkaneUtxos.push({
                txId: alkane.outpoint.outpoint.txid,
                txIndex: alkane.outpoint.outpoint.vout,
                script: alkane.outpoint.output.script,
                address,
                amountOfAlkanes: alkane.rune.balance,
                satoshis,
                ...alkane.rune.rune,
            });
            totalSatoshis += satoshis;
            totalBalanceBeingSent +=
                Number(alkane.rune.balance) /
                    (alkane.rune.rune.divisibility == 1
                        ? 1
                        : 10 ** alkane.rune.rune.divisibility);
        }
    }
    if (totalBalanceBeingSent < targetNumberOfAlkanes) {
        throw new errors_1.OylTransactionError(Error('Insuffiecient balance of alkanes.'));
    }
    return { alkaneUtxos, totalSatoshis, totalBalanceBeingSent };
};
exports.findAlkaneUtxos = findAlkaneUtxos;
const actualTransactRevealFee = async ({ protostone, tweakedPublicKey, commitTxId, receiverAddress, script, provider, feeRate, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createTransactReveal)({
        protostone,
        commitTxId,
        receiverAddress,
        script,
        tweakedPublicKey,
        provider,
        feeRate,
    });
    const { fee: estimatedFee } = await (0, psbt_1.getEstimatedFee)({
        feeRate,
        psbt,
        provider,
    });
    const { psbt: finalPsbt } = await (0, exports.createTransactReveal)({
        protostone,
        commitTxId,
        receiverAddress,
        script,
        tweakedPublicKey,
        provider,
        feeRate,
        fee: estimatedFee,
    });
    const { fee: finalFee, vsize } = await (0, psbt_1.getEstimatedFee)({
        feeRate,
        psbt: finalPsbt,
        provider,
    });
    return { fee: finalFee, vsize };
};
exports.actualTransactRevealFee = actualTransactRevealFee;
const actualExecuteFee = async ({ gatheredUtxos, account, protostone, provider, feeRate, alkaneUtxos, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createExecutePsbt)({
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        alkaneUtxos,
    });
    const { fee: estimatedFee } = await (0, psbt_1.getEstimatedFee)({
        feeRate,
        psbt,
        provider,
    });
    const { psbt: finalPsbt } = await (0, exports.createExecutePsbt)({
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        alkaneUtxos,
        fee: estimatedFee,
    });
    const { fee: finalFee, vsize } = await (0, psbt_1.getEstimatedFee)({
        feeRate,
        psbt: finalPsbt,
        provider,
    });
    return { fee: finalFee, vsize };
};
exports.actualExecuteFee = actualExecuteFee;
const executePsbt = async ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, }) => {
    const { fee } = await (0, exports.actualExecuteFee)({
        alkaneUtxos,
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
    });
    const { psbt: finalPsbt } = await (0, exports.createExecutePsbt)({
        alkaneUtxos,
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        fee,
    });
    return { psbt: finalPsbt, fee };
};
exports.executePsbt = executePsbt;
const execute = async ({ alkaneUtxos, gatheredUtxos, account, protostone, provider, feeRate, signer, enableRBF = true, }) => {
    const { fee } = await (0, exports.actualExecuteFee)({
        alkaneUtxos,
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
    });
    const { psbt: finalPsbt } = await (0, exports.createExecutePsbt)({
        alkaneUtxos,
        gatheredUtxos,
        account,
        protostone,
        provider,
        feeRate,
        fee,
        enableRBF,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    const pushResult = await provider.pushPsbt({
        psbtBase64: signedPsbt,
    });
    return pushResult;
};
exports.execute = execute;
const createTransactReveal = async ({ protostone, receiverAddress, script, feeRate, tweakedPublicKey, provider, fee = 0, commitTxId, }) => {
    try {
        if (!feeRate) {
            feeRate = (await provider.esplora.getFeeEstimates())['1'];
        }
        const psbt = new bitcoin.Psbt({ network: provider.network });
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 1,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        const revealTxBaseFee = Math.ceil(minFee * feeRate) < 250 ? 250 : Math.ceil(minFee * feeRate);
        const revealTxChange = fee === 0 ? 0 : Math.floor(Number(revealTxBaseFee) - fee);
        const commitTxOutput = await (0, utils_1.getOutputValueByVOutIndex)({
            txId: commitTxId,
            vOut: 0,
            esploraRpc: provider.esplora,
        });
        if (!commitTxOutput) {
            throw new errors_1.OylTransactionError(new Error('Error getting vin #0 value'));
        }
        const p2pk_redeem = { output: script };
        const { output, witness } = bitcoin.payments.p2tr({
            internalPubkey: (0, bip371_1.toXOnly)(Buffer.from(tweakedPublicKey, 'hex')),
            scriptTree: p2pk_redeem,
            redeem: p2pk_redeem,
            network: provider.network,
        });
        psbt.addInput({
            hash: commitTxId,
            index: 0,
            witnessUtxo: {
                value: commitTxOutput.value,
                script: output,
            },
            tapLeafScript: [
                {
                    leafVersion: bip341_1.LEAF_VERSION_TAPSCRIPT,
                    script: p2pk_redeem.output,
                    controlBlock: witness[witness.length - 1],
                },
            ],
        });
        psbt.addOutput({
            value: 546,
            address: receiverAddress,
        });
        psbt.addOutput({
            value: 0,
            script: protostone,
        });
        if (revealTxChange > 546) {
            psbt.addOutput({
                value: Math.floor(revealTxChange),
                address: receiverAddress,
            });
        }
        return {
            psbt: psbt.toBase64(),
            fee: revealTxChange,
        };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createTransactReveal = createTransactReveal;
const bumpFee = async ({ txid, newFeeRate, account, provider, signer, }) => {
    try {
        // 获取原始交易
        const txInfo = await provider.esplora.getTxInfo(txid);
        if (!txInfo) {
            throw new Error('Transaction not found');
        }
        // 输出完整交易信息用于调试
        console.log('完整交易信息:', JSON.stringify(txInfo, null, 2));
        // 确保交易尚未确认
        if (txInfo.status.confirmed) {
            throw new Error('Transaction is already confirmed and cannot be replaced');
        }
        // 检查交易是否启用了RBF
        const hasRBF = txInfo.vin.some(input => {
            // sequence < 0xfffffffe (即0xffffffff - 1) 表示启用了RBF
            console.log(`输入序列号: ${input.sequence}, 标准: ${0xfffffffe}`);
            // 将序列号转换为十六进制便于比较
            const sequenceHex = input.sequence.toString(16);
            console.log(`序列号16进制: ${sequenceHex}`);
            return input.sequence < 0xfffffffe;
        });
        console.log(`RBF状态: ${hasRBF}`);
        if (!hasRBF) {
            throw new Error('Transaction does not have RBF enabled');
        }
        // 输出所有vout数据用于调试
        console.log('交易输出详情:');
        txInfo.vout.forEach((output, index) => {
            console.log(`输出 #${index}:`, JSON.stringify(output, null, 2));
        });
        // 检查是否是Alkanes交易
        // 通常Alkanes交易会有一个特定的输出，包含protostone数据
        const isAlkanesTransaction = txInfo.vout.some(output => {
            // 这里可以添加更精确的检测逻辑
            const isNullData = output.scriptpubkey_type === 'null-data' || output.scriptpubkey_type === 'op_return';
            console.log(`输出类型: ${output.scriptpubkey_type}, 是否为null-data或op_return: ${isNullData}`);
            return isNullData;
        });
        console.log(`是否为Alkanes交易: ${isAlkanesTransaction}`);
        if (!isAlkanesTransaction) {
            throw new Error('This does not appear to be an Alkanes transaction');
        }
        // 收集原始交易的输入和输出
        const utxos = [];
        let protostone = null;
        // 获取原始交易的输入
        for (const input of txInfo.vin) {
            const prevTx = await provider.esplora.getTxInfo(input.txid);
            if (!prevTx) {
                throw new Error(`Previous transaction not found: ${input.txid}`);
            }
            const prevOutput = prevTx.vout[input.vout];
            // Esplora API返回的值已经是satoshis单位，无需转换
            const satoshis = Number(prevOutput.value);
            console.log(`添加UTXO: txId=${input.txid}, vout=${input.vout}, 金额=${satoshis} satoshis`);
            utxos.push({
                txId: input.txid,
                outputIndex: input.vout,
                satoshis: satoshis,
                scriptPk: prevOutput.scriptpubkey,
                address: prevOutput.scriptpubkey_address,
            });
        }
        // 找到protostone数据
        for (const output of txInfo.vout) {
            if (output.scriptpubkey_type === 'null-data' || output.scriptpubkey_type === 'op_return') {
                // 假设这是protostone数据
                protostone = Buffer.from(output.scriptpubkey, 'hex');
                console.log('找到protostone数据:', output.scriptpubkey);
                break;
            }
        }
        if (!protostone) {
            throw new Error('Could not extract protostone data from the transaction');
        }
        // 计算总输入金额
        const totalInputAmount = utxos.reduce((acc, curr) => acc + curr.satoshis, 0);
        console.log(`总输入金额: ${totalInputAmount}`);
        // 执行新交易
        const gatheredUtxos = {
            utxos,
            totalAmount: totalInputAmount
        };
        console.log('收集到的UTXO:', JSON.stringify(gatheredUtxos, null, 2));
        // 优化计算交易大小的方法，使其更符合实际情况
        const inputCount = utxos.length;
        const outputCount = 3; // 通常为3个输出：目标地址、OP_RETURN以及找零地址
        // 优化txSize计算
        const witnessOverhead = 2 + inputCount; // 见证开销
        const baseSize = 4 + // 版本
            1 + // 输入数量变长整数（通常为1字节）
            inputCount * 40 + // 每个输入的大小（非见证部分）
            1 + // 输出数量变长整数（通常为1字节）
            outputCount * 34 + // 每个输出的大小
            4; // 锁定时间
        const witnessSize = inputCount * 108; // 每个输入的见证数据大约108字节（签名+公钥）
        // vsize = (baseSize * 3 + totalSize) / 4
        const totalSize = baseSize + witnessSize + witnessOverhead;
        const vsize = Math.ceil((baseSize * 3 + totalSize) / 4);
        console.log(`预计RBF交易大小 - baseSize: ${baseSize}, witnessSize: ${witnessSize}, vsize: ${vsize}`);
        console.log(`实际交易大小: ${txInfo.size}, 权重: ${txInfo.weight}`);
        // 计算实际手续费和预期手续费
        const actualFeeRate = Math.ceil(newFeeRate * vsize / txInfo.size);
        console.log(`调整前的手续费率计算: ${actualFeeRate} sat/vB (基于大小比例计算)`);
        console.log(`使用用户指定的手续费率: ${newFeeRate} sat/vB (直接使用请求值)`);
        const { psbt } = await (0, exports.createExecutePsbt)({
            gatheredUtxos: gatheredUtxos,
            account,
            protostone,
            provider,
            feeRate: newFeeRate,
            enableRBF: true, // 确保启用RBF
        });
        const { signedPsbt } = await signer.signAllInputs({
            rawPsbt: psbt,
            finalize: true,
        });
        // 广播替换交易
        const result = await provider.pushPsbt({
            psbtBase64: signedPsbt,
        });
        return {
            originalTxId: txid,
            newTxId: result.txId,
            newFeeRate: newFeeRate,
            success: true,
        };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.bumpFee = bumpFee;
//# sourceMappingURL=alkanes.js.map