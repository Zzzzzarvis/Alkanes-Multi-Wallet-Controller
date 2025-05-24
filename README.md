# 多钱包并行管理器 (Multi-Wallet Parallel Manager)

一个基于 OYL SDK 的强大比特币多钱包并行操作工具，支持同时管理和操作多个钱包，提供高效的并发执行能力。

## 🚀 功能特色

- **完全独立**：内置完整 OYL SDK，无需额外安装依赖
- **并发执行**：支持同时操作多个钱包，大幅提升效率
- **灵活配置**：支持单钱包、钱包范围、自定义钱包列表等多种操作模式
- **安全可靠**：每个钱包独立配置，支持不同网络和API配置
- **详细反馈**：提供完整的执行结果和错误信息
- **中文界面**：全中文操作界面，使用简单直观

## 📋 系统要求

- Node.js 14.0 或更高版本
- npm 6.0 或更高版本
- 操作系统：Windows / macOS / Linux

## 🔧 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/Zzzzzarvis/Alkanes-Multi-Wallet-Controller.git
cd Alkanes-Multi-Wallet-Controller
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置钱包

#### 方法一：自动生成钱包（推荐新手）

```bash
# 生成指定数量的钱包配置
node setup-wallets.js 5
```

这将生成 5 个钱包的配置文件（.env.wallet1 到 .env.wallet5）

#### 方法二：手动创建钱包配置

复制模板文件：
```bash
cp .env.wallet.example .env.wallet1
```

编辑 `.env.wallet1` 文件：
```bash
SANDSHREW_API_URL=https://mainnet.sandshrew.io
SANDSHREW_PROJECT_ID=你的项目ID
NETWORK_TYPE=bitcoin
WALLET_MNEMONIC=你的助记词
WALLET_INDEX=1
```

**重要配置说明：**
- `SANDSHREW_API_URL`: API服务器地址
  - 主网：`https://mainnet.sandshrew.io`
  - 测试网：`https://regtest.sandshrew.io`
- `SANDSHREW_PROJECT_ID`: 你的 Sandshrew 项目 ID
- `NETWORK_TYPE`: 网络类型，通常为 `bitcoin`
- `WALLET_MNEMONIC`: 12 个单词的助记词
- `WALLET_INDEX`: 钱包索引编号

### 4. 验证配置

```bash
# 测试钱包1的配置
node concurrent_executor.js 1 "node lib/cli/index.js account mnemonicToAccount -p bitcoin"
```

## 🎯 使用方法

### 基本语法

```bash
node concurrent_executor.js [钱包范围] "<OYL命令>"
```

### 钱包范围格式

1. **单个钱包**：`1`
2. **钱包范围**：`1-5` （钱包1到5）
3. **指定钱包**：`1,3,5` （钱包1、3、5）
4. **默认钱包**：不指定范围时默认使用钱包1,2,3

### 常用操作示例

#### 🔍 查询操作

```bash
# 查询所有钱包余额
node concurrent_executor.js 1-10 "node lib/cli/index.js utxo balance -p bitcoin"

# 查询指定钱包的账户信息
node concurrent_executor.js 1,2,3 "node lib/cli/index.js account mnemonicToAccount -p bitcoin"

# 查询UTXO信息
node concurrent_executor.js 1-5 "node lib/cli/index.js utxo accountAvailableBalance"
```

#### 💰 交易操作

```bash
# 发送比特币交易
node concurrent_executor.js 1 "node lib/cli/index.js btc send -to bc1qxxxxx -amount 0.001 -feeRate 10"

# 批量发送交易（请谨慎使用）
node concurrent_executor.js 1-3 "node lib/cli/index.js btc send -to bc1qxxxxx -amount 0.0001 -feeRate 5"
```

#### 🏺 Alkane 操作

```bash
# 执行 Alkane 合约
node concurrent_executor.js 1 "node lib/cli/index.js alkane execute -data \"2,1,77\" -e \"2:1:333:1\" -feeRate 5"

# 部署 Alkane 合约
node concurrent_executor.js 1 "node lib/cli/index.js alkane deploy -file ./contract.wasm -feeRate 10"
```

#### 💎 NFT 和代币操作

```bash
# BRC20 代币操作
node concurrent_executor.js 1 "node lib/cli/index.js brc20 mint -ticker ORDI -amount 1000 -feeRate 20"

# Rune 代币操作
node concurrent_executor.js 1-5 "node lib/cli/index.js rune mint -name TESTCOIN -amount 100 -feeRate 15"
```

## 📊 执行结果解读

执行命令后会显示详细的结果信息：

```
目标钱包: 1, 2, 3
执行命令: node lib/cli/index.js utxo balance -p bitcoin

开始并发执行命令: node lib/cli/index.js utxo balance -p bitcoin
钱包数量: 3
================================================================================
钱包 1 执行命令: node lib/cli/index.js utxo balance -p bitcoin
钱包 2 执行命令: node lib/cli/index.js utxo balance -p bitcoin
钱包 3 执行命令: node lib/cli/index.js utxo balance -p bitcoin
✅ 钱包 1 命令执行成功
✅ 钱包 2 命令执行成功
✅ 钱包 3 命令执行成功

================================================================================
执行结果汇总:
✅ 成功: 3 个钱包
❌ 失败: 0 个钱包

成功的钱包输出:

--- 钱包 1 ---
{ confirmedAmount: 0, pendingAmount: 0, amount: 0 }

--- 钱包 2 ---
{ confirmedAmount: 0, pendingAmount: 0, amount: 0 }

--- 钱包 3 ---
{ confirmedAmount: 0, pendingAmount: 0, amount: 0 }
```

## 🛡️ 安全注意事项

### 🔒 钱包安全

1. **助记词保护**：
   - 绝不要将含有真实助记词的 `.env.wallet*` 文件上传到 GitHub
   - 建议使用测试钱包进行初期学习
   - 生产环境使用时确保助记词安全存储

2. **API密钥安全**：
   - 保护好你的 `SANDSHREW_PROJECT_ID`
   - 不要在公共场所分享配置文件
   - 定期更换API密钥

3. **网络安全**：
   - 确认使用正确的网络（主网/测试网）
   - 在主网操作前务必在测试网验证

### ⚠️ 操作风险

1. **并发操作风险**：
   - 同时操作多个钱包时请确保有足够余额
   - 大量并发可能触发API限制
   - 建议先小规模测试

2. **交易确认**：
   - 发送交易前仔细确认地址和金额
   - 设置合理的手续费率
   - 监控交易状态

## 🔧 高级配置

### 环境变量配置

创建 `.env` 文件进行全局配置：

```bash
# 默认网络配置
DEFAULT_NETWORK=bitcoin
DEFAULT_FEE_RATE=10

# API配置
DEFAULT_API_URL=https://mainnet.sandshrew.io
DEFAULT_PROJECT_ID=你的默认项目ID

# 执行配置
MAX_CONCURRENT=10
RETRY_ATTEMPTS=3
```

### 自定义脚本

你可以创建自定义脚本来执行特定任务：

```javascript
// custom-script.js
const { spawn } = require('child_process');

// 你的自定义逻辑
async function customTask() {
    // 执行特定的钱包操作
}

customTask();
```

## 📚 OYL SDK 命令参考

### 账户管理
```bash
# 生成账户信息
node lib/cli/index.js account mnemonicToAccount -p bitcoin

# 获取地址
node lib/cli/index.js account getAddress -p bitcoin
```

### UTXO 管理
```bash
# 查询余额
node lib/cli/index.js utxo balance -p bitcoin

# 查询可用余额
node lib/cli/index.js utxo accountAvailableBalance

# 列出UTXO
node lib/cli/index.js utxo list -p bitcoin
```

### 比特币交易
```bash
# 发送交易
node lib/cli/index.js btc send -to <地址> -amount <金额> -feeRate <费率>

# 创建交易
node lib/cli/index.js btc createTransaction -to <地址> -amount <金额>
```

### Alkane 合约
```bash
# 执行合约
node lib/cli/index.js alkane execute -data "<数据>" -e "<环境>" -feeRate <费率>

# 部署合约
node lib/cli/index.js alkane deploy -file <文件路径> -feeRate <费率>

# 查询合约
node lib/cli/index.js alkane query -id <合约ID>
```

## 🐛 故障排除

### 常见错误

1. **"API key not found"**
   - 检查 `SANDSHREW_PROJECT_ID` 是否正确
   - 确认项目ID有效且未过期
   - 验证网络配置是否匹配

2. **"钱包文件不存在"**
   - 确认 `.env.wallet<N>` 文件存在
   - 检查文件权限
   - 验证文件格式

3. **"余额不足"**
   - 确认钱包有足够的比特币
   - 检查手续费设置
   - 验证UTXO状态

4. **"网络错误"**
   - 检查网络连接
   - 验证API服务器状态
   - 尝试切换API端点

### 调试方法

```bash
# 单钱包测试
node concurrent_executor.js 1 "node lib/cli/index.js account mnemonicToAccount -p bitcoin"

# 检查配置
cat .env.wallet1

# 验证网络连接
ping mainnet.sandshrew.io
```

## 🤝 贡献指南

欢迎提交Issues和Pull Requests来改进项目！

### 开发环境设置

```bash
# 克隆项目
git clone <仓库地址>
cd multi-wallet-controller-github

# 安装依赖
npm install

# 运行测试
npm test
```

## 📄 许可证

MIT License

## 📞 支持

如有问题，请：
1. 查看本README的故障排除部分
2. 在GitHub上提交Issue
3. 联系项目维护者

---

**免责声明**: 本工具涉及加密货币操作，使用前请充分了解相关风险。在主网操作前，建议先在测试网环境进行充分测试。作者不对因使用本工具造成的任何损失承担责任。