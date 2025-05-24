#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function setupWallets() {
    console.log('🚀 多钱包群控器配置向导');
    console.log('='.repeat(50));
    
    // 获取基本配置
    const sandhrewUrl = await question('Sandshrew API URL (默认: https://mainnet.sandshrew.io): ') 
        || 'https://mainnet.sandshrew.io';
    
    const projectId = await question('Sandshrew Project ID: ');
    if (!projectId.trim()) {
        console.log('❌ Project ID 不能为空!');
        process.exit(1);
    }
    
    const networkType = await question('网络类型 (默认: bitcoin): ') || 'bitcoin';
    
    const mnemonic = await question('助记词 (12个单词，空格分隔): ');
    if (!mnemonic.trim()) {
        console.log('❌ 助记词不能为空!');
        process.exit(1);
    }
    
    // 验证助记词格式
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12) {
        console.log(`❌ 助记词应该有12个单词，您输入了${words.length}个!`);
        process.exit(1);
    }
    
    const walletCount = parseInt(await question('要创建多少个钱包配置? (1-50): '));
    if (isNaN(walletCount) || walletCount < 1 || walletCount > 50) {
        console.log('❌ 钱包数量必须在1-50之间!');
        process.exit(1);
    }
    
    console.log('\n📝 开始创建钱包配置文件...');
    
    // 创建钱包配置文件
    for (let i = 1; i <= walletCount; i++) {
        const configContent = `SANDSHREW_API_URL=${sandhrewUrl}
SANDSHREW_PROJECT_ID=${projectId}
NETWORK_TYPE=${networkType}
WALLET_MNEMONIC=${mnemonic}
WALLET_INDEX=${i}`;
        
        const filename = `.env.wallet${i}`;
        fs.writeFileSync(filename, configContent);
        console.log(`✅ 创建 ${filename}`);
    }
    
    console.log('\n🎉 钱包配置完成!');
    console.log('\n📋 使用示例:');
    console.log(`# 查询所有钱包余额:`);
    console.log(`node concurrent_executor.js 1-${walletCount} "node lib/cli/index.js utxo balance -p bitcoin"`);
    console.log('\n# 查询前5个钱包:');
    console.log(`node concurrent_executor.js 1-5 "node lib/cli/index.js utxo balance -p bitcoin"`);
    
    console.log('\n⚠️  安全提醒:');
    console.log('- 请保护好您的助记词和配置文件');
    console.log('- 不要将 .env.wallet* 文件上传到公共仓库');
    console.log('- 定期备份重要配置');
    
    rl.close();
}

setupWallets().catch(error => {
    console.error('配置失败:', error.message);
    process.exit(1);
}); 