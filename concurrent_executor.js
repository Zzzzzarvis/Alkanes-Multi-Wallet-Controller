const fs = require('fs');
const { spawn } = require('child_process');

// 加载环境文件的函数
function loadEnvFile(envFile) {
    const envVars = {};
    const content = fs.readFileSync(envFile, 'utf8');
    
    content.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                envVars[key.trim()] = valueParts.join('=').trim();
            }
        }
    });
    
    return envVars;
}

// 执行任意OYL命令
async function executeCommand(walletId, command) {
    const envFile = `.env.wallet${walletId}`;
    
    // 检查环境文件是否存在
    if (!fs.existsSync(envFile)) {
        throw new Error(`环境文件 ${envFile} 不存在`);
    }

    console.log(`钱包 ${walletId} 执行命令: ${command}`);

    return new Promise((resolve, reject) => {
        const child = spawn('bash', ['-c', command], {
            cwd: process.cwd(),
            env: { 
                ...process.env,
                ...loadEnvFile(envFile)
            },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            const result = {
                walletId,
                command,
                exitCode: code,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                timestamp: new Date().toISOString()
            };

            if (code === 0) {
                console.log(`✅ 钱包 ${walletId} 命令执行成功`);
                resolve(result);
            } else {
                console.log(`❌ 钱包 ${walletId} 命令执行失败，退出码: ${code}`);
                reject(result);
            }
        });

        child.on('error', (error) => {
            console.log(`❌ 钱包 ${walletId} 命令执行出错: ${error.message}`);
            reject({
                walletId,
                command,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        });
    });
}

// 并发执行多个钱包的命令
async function executeConcurrent(walletIds, command) {
    console.log(`开始并发执行命令: ${command}`);
    console.log(`钱包数量: ${walletIds.length}`);
    console.log('='.repeat(80));

    const promises = walletIds.map(walletId => 
        executeCommand(walletId, command)
            .catch(error => error) // 捕获错误但不中断其他钱包的执行
    );

    const results = await Promise.all(promises);
    
    console.log('\n' + '='.repeat(80));
    console.log('执行结果汇总:');
    
    const successful = results.filter(r => r.exitCode === 0);
    const failed = results.filter(r => r.exitCode !== 0 || r.error);
    
    console.log(`✅ 成功: ${successful.length} 个钱包`);
    console.log(`❌ 失败: ${failed.length} 个钱包`);
    
    if (successful.length > 0) {
        console.log('\n成功的钱包输出:');
        successful.forEach(result => {
            console.log(`\n--- 钱包 ${result.walletId} ---`);
            console.log(result.stdout || '(无输出)');
        });
    }
    
    if (failed.length > 0) {
        console.log('\n失败的钱包错误:');
        failed.forEach(result => {
            console.log(`\n--- 钱包 ${result.walletId} ---`);
            console.log(result.stderr || result.error || '未知错误');
        });
    }
    
    return results;
}

// 主程序
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('用法: node concurrent_executor.js [钱包ID列表] <OYL命令>');
        console.log('');
        console.log('参数说明:');
        console.log('  [钱包ID列表] - 可选，格式如 1,2,3 或 1-3，默认为 1,2,3');
        console.log('  <OYL命令>    - 要执行的完整OYL命令');
        console.log('');
        console.log('示例:');
        console.log('  # 查询所有钱包的BTC余额');
        console.log('  node concurrent_executor.js "node lib/cli/index.js utxo accountAvailableBalance"');
        console.log('');
        console.log('  # 在指定钱包上执行alkane命令');
        console.log('  node concurrent_executor.js 1,2 "node lib/cli/index.js alkane execute -data \\"2,1,77\\" -e \\"2:1:333:1\\" -feeRate 5"');
        console.log('');
        console.log('  # 查询账户信息');
        console.log('  node concurrent_executor.js "node lib/cli/index.js account mnemonicToAccount -p bitcoin"');
        process.exit(1);
    }

    let walletIds;
    let command;

    // 解析参数
    if (args.length === 1) {
        // 只有命令，使用默认钱包
        walletIds = [1, 2, 3];
        command = args[0];
    } else {
        // 第一个参数是钱包ID，第二个是命令
        const walletSpec = args[0];
        command = args.slice(1).join(' ');
        
        // 解析钱包ID
        if (walletSpec.includes('-')) {
            // 范围格式 如 1-3
            const [start, end] = walletSpec.split('-').map(Number);
            walletIds = Array.from({length: end - start + 1}, (_, i) => start + i);
        } else {
            // 逗号分隔格式 如 1,2,3
            walletIds = walletSpec.split(',').map(Number);
        }
    }
    
    console.log(`目标钱包: ${walletIds.join(', ')}`);
    console.log(`执行命令: ${command}`);
    console.log('');

    try {
        await executeConcurrent(walletIds, command);
    } catch (error) {
        console.error('执行失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此文件，则执行主程序
if (require.main === module) {
    main();
} 