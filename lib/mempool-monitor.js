/**
 * 内存池监控器
 * 负责监控比特币内存池中的交易，识别新交易并计算费率
 */

const EventEmitter = require('events');

class MempoolMonitor extends EventEmitter {
  constructor(apiClient, config = {}) {
    super();
    
    // 保存依赖和配置
    this.apiClient = apiClient;
    this.config = {
      // 监控间隔(毫秒)
      interval: config.interval || 5000,
      
      // 最小费率阈值(sat/vB)，低于此值的交易将被忽略
      minFeeRate: config.minFeeRate || 10,
      
      // 是否启用调试信息
      debug: config.debug || false
    };
    
    // 状态变量
    this.active = false;                 // 监控器是否活跃
    this.monitorInterval = null;         // 定时器句柄
    this.knownTxids = new Set();         // 已知交易ID集合
    
    // 统计信息
    this.statistics = {
      totalChecks: 0,                    // 总检查次数
      newTransactions: 0,                // 新交易数量
      ignoredTransactions: 0,            // 被忽略的交易数量
      errorCount: 0                      // 错误计数
    };
    
    // 绑定方法上下文
    this.checkMempool = this.checkMempool.bind(this);
  }
  
  /**
   * 启动监控器
   */
  start() {
    if (this.active) {
      return;
    }
    
    this.active = true;
    
    // 立即执行一次检查
    this.checkMempool();
    
    // 设置定时检查
    this.monitorInterval = setInterval(
      this.checkMempool, 
      this.config.interval
    );
    
    if (this.config.debug) {
      console.log(`内存池监控已启动，间隔: ${this.config.interval}ms, 最小费率: ${this.config.minFeeRate} sat/vB`);
    }
  }
  
  /**
   * 停止监控器
   */
  stop() {
    if (!this.active) {
      return;
    }
    
    this.active = false;
    
    // 清除定时器
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    if (this.config.debug) {
      console.log('内存池监控已停止');
    }
  }
  
  /**
   * 检查内存池中的交易
   */
  async checkMempool() {
    if (!this.active) {
      return;
    }
    
    try {
      // 获取内存池中的最新交易
      const transactions = await this.apiClient.getMempoolTransactions();
      
      // 更新统计信息
      this.statistics.totalChecks++;
      
      if (!transactions || transactions.length === 0) {
        if (this.config.debug) {
          console.log('内存池中没有交易');
        }
        return;
      }
      
      // 处理新交易
      let newCount = 0;
      let ignoredCount = 0;
      
      for (const tx of transactions) {
        // 检查是否已知此交易
        if (tx.txid && !this.knownTxids.has(tx.txid)) {
          // 计算交易费率
          const feeRate = this.calculateFeeRate(tx);
          
          // 检查费率是否达到最小阈值
          if (feeRate >= this.config.minFeeRate) {
            // 新交易且费率足够高
            this.knownTxids.add(tx.txid);
            newCount++;
            
            // 发出交易事件
            this.emit('transaction', {
              txid: tx.txid,
              feeRate,
              timestamp: Date.now(),
              source: 'mempool-monitor'
            });
            
            if (this.config.debug) {
              console.log(`[内存池] 发现新交易: ${tx.txid}, 费率: ${feeRate} sat/vB`);
            }
          } else {
            // 忽略低费率交易
            ignoredCount++;
            
            if (this.config.debug) {
              console.log(`[内存池] 忽略低费率交易: ${tx.txid}, 费率: ${feeRate} sat/vB (低于 ${this.config.minFeeRate})`);
            }
          }
        }
      }
      
      // 更新统计信息
      this.statistics.newTransactions += newCount;
      this.statistics.ignoredTransactions += ignoredCount;
      
      // 限制已知交易集合大小
      if (this.knownTxids.size > 10000) {
        this.trimKnownTxids();
      }
      
      if (this.config.debug && (newCount > 0 || ignoredCount > 0)) {
        console.log(`[内存池] 本次检查: ${newCount} 个新交易, ${ignoredCount} 个低费率交易被忽略`);
      }
    } catch (error) {
      this.statistics.errorCount++;
      
      // 发出错误事件
      this.emit('error', {
        source: 'mempool-monitor',
        message: error.message,
        timestamp: Date.now()
      });
      
      console.error(`检查内存池时出错: ${error.message}`);
    }
  }
  
  /**
   * 修剪已知交易ID集合，仅保留最近的5000个
   */
  trimKnownTxids() {
    // 转换为数组
    const txidsArray = Array.from(this.knownTxids);
    
    // 只保留最近的5000个
    const trimmedTxids = txidsArray.slice(txidsArray.length - 5000);
    
    // 创建新集合
    this.knownTxids = new Set(trimmedTxids);
    
    if (this.config.debug) {
      console.log(`已修剪已知交易ID集合，从 ${txidsArray.length} 减少到 ${this.knownTxids.size}`);
    }
  }
  
  /**
   * 计算交易费率
   * @param {Object} tx - 交易对象
   * @returns {number} - 费率 (sat/vB)
   */
  calculateFeeRate(tx) {
    try {
      // 如果交易对象已经包含费率，直接使用
      if (tx.fee_rate) {
        return parseFloat(tx.fee_rate);
      }
      
      // 使用fee和vsize计算
      if (tx.fee !== undefined && tx.vsize) {
        return parseFloat((tx.fee / tx.vsize).toFixed(2));
      }
      
      // 使用fee和size计算
      if (tx.fee !== undefined && tx.size) {
        return parseFloat((tx.fee / tx.size).toFixed(2));
      }
      
      // 默认费率
      return 50; // 默认50 sat/vB
    } catch (error) {
      console.error(`计算费率时出错: ${error.message}`);
      return 50; // 出错时返回默认费率
    }
  }
  
  /**
   * 获取监控器状态
   */
  getStatus() {
    return {
      active: this.active,
      knownTransactions: this.knownTxids.size,
      minFeeRate: this.config.minFeeRate,
      interval: this.config.interval,
      statistics: this.statistics
    };
  }
  
  /**
   * 清空已知交易集合
   */
  clearKnownTransactions() {
    this.knownTxids.clear();
    if (this.config.debug) {
      console.log('已清空已知交易ID集合');
    }
  }
  
  /**
   * 更新最小费率阈值
   * @param {number} newMinFeeRate - 新的最小费率阈值
   */
  updateMinFeeRate(newMinFeeRate) {
    if (typeof newMinFeeRate === 'number' && newMinFeeRate >= 0) {
      this.config.minFeeRate = newMinFeeRate;
      if (this.config.debug) {
        console.log(`已更新最小费率阈值为 ${newMinFeeRate} sat/vB`);
      }
    }
  }
}

module.exports = MempoolMonitor; 