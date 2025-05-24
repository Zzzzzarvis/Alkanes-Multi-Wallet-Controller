"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.btcBumpFee = exports.btcSend = void 0;
const tslib_1 = require("tslib");
const commander_1 = require("commander");
const btc = tslib_1.__importStar(require("../btc"));
const utxo = tslib_1.__importStar(require("../utxo"));
const wallet_1 = require("./wallet");
exports.btcSend = new commander_1.Command('send')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .requiredOption('-amt, --amount <amount>', 'amount you want to send')
    .requiredOption('-t, --to <to>', 'address you want to send to')
    .option('-feeRate, --feeRate <feeRate>', 'fee rate')
    /* @dev example call
    oyl btc send -p regtest -t bcrt1qzr9vhs60g6qlmk7x3dd7g3ja30wyts48sxuemv -amt 1000 -feeRate 2
  */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    const account = wallet.account;
    const provider = wallet.provider;
    const signer = wallet.signer;
    const { accountSpendableTotalUtxos } = await utxo.accountUtxos({
        account,
        provider,
    });
    console.log(await btc.send({
        utxos: accountSpendableTotalUtxos,
        toAddress: options.to,
        feeRate: options.feeRate,
        account,
        signer,
        provider,
        amount: options.amount,
    }));
});
// 添加bump-fee命令
exports.btcBumpFee = new commander_1.Command('bump-fee')
    .requiredOption('-p, --provider <provider>', 'Network provider type (regtest, bitcoin)')
    .requiredOption('-txid, --txid <txid>', 'Transaction ID to bump fee for')
    .requiredOption('-feeRate, --feeRate <feeRate>', 'New fee rate (sat/vByte)')
    /* @dev example call
    oyl btc bump-fee -p bitcoin -txid 4743a31b9dc5dedf1ce9d9741921d4d554bfca303c61ded9224d212315c82c83 -feeRate 102
  */
    .action(async (options) => {
    const wallet = new wallet_1.Wallet({ networkType: options.provider });
    const account = wallet.account;
    const provider = wallet.provider;
    const signer = wallet.signer;
    try {
        console.log(await btc.bumpFee({
            txid: options.txid,
            newFeeRate: parseFloat(options.feeRate),
            account,
            provider,
            signer,
        }));
    }
    catch (error) {
        console.error('Error bumping fee:', error.message);
    }
});
//# sourceMappingURL=btc.js.map