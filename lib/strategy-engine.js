/**
 * 策略引擎
 * 负责决定是否对竞争对手的交易进行竞争，并计算最佳的竞争费率
 */

const EventEmitter = require('events');

class StrategyEngine extends EventEmitter {
  constructor(apiClient, config = {}) {
    super();
    
    // 保存依赖和配置
    this.apiClient = apiClient;
    this.config = {
      // 自身地址
      selfAddress: config.selfAddress || '',
      
      // 最小费率加价百分比
      minFeeBumpPercent: config.minFeeBumpPercent || 10,
      
      // 最大费率加价百分比
      maxFeeBumpPercent: config.maxFeeBumpPercent || 30,
      
      // 最大费率上限 (sat/vB)
      maxFeeRate: config.maxFeeRate || 200,
      
      // 最小费率下限 (sat/vB)
      minFeeRate: config.minFeeRate || 30,
      
      // 关键竞争对手的交易是否始终参与竞争
      alwaysCompeteWithKey: config.alwaysCompeteWithKey !== false,
      
      // 是否启用调试信息
      debug: config.debug || false
    };
    
    // 状态变量
    this.competitionHistory = [];     // 竞争历史记录
    this.feeSuggestions = {           // 费率建议缓存
      timestamp: 0,
      estimates: {}
    };
    
    // 统计信息
    this.statistics = {
      totalTransactionsEvaluated: 0,      // 评估的交易总数
      competitionsTriggered: 0,           // 触发的竞争次数
      competitionsSkipped: 0,             // 跳过的竞争次数
      totalFeesSpent: 0                   // 总费用支出 (sats)
    };
    
    // 绑定方法上下文
    this.evaluateTransaction = this.evaluateTransaction.bind(this);
    this.updateFeeEstimates = this.updateFeeEstimates.bind(this);
    
    // 初始化时更新一次费率估计
    this.updateFeeEstimates();
  }
  
  /**
   * 评估交易是否需要竞争
   * @param {Object} transaction - 交易信息
   * @returns {Promise<Object>} - 竞争决策结果
   */
  async evaluateTransaction(transaction) {
    try {
      // 更新统计信息
      this.statistics.totalTransactionsEvaluated++;
      
      // 确保费率估计是最新的
      await this.ensureFreshFeeEstimates();
      
      // 检查基本参数
      if (!transaction.txid) {
        throw new Error('交易缺少TXID');
      }
      
      // 检查是否是自己的交易
      if (transaction.address === this.config.selfAddress) {
        if (this.config.debug) {
          console.log(`[策略] 跳过自己的交易: ${transaction.txid}`);
        }
        return this.createSkipDecision(transaction, '自己的交易');
      }
      
      // 获取交易费率
      const { feeRate } = transaction;
      
      // 如果没有费率数据，尝试获取详细信息
      if (feeRate === undefined || feeRate === null) {
        try {
          const txDetails = await this.apiClient.getTransaction(transaction.txid);
          transaction.feeRate = this.calculateFeeRate(txDetails);
        } catch (error) {
          if (this.config.debug) {
            console.error(`[策略] 获取交易详情失败: ${error.message}`);
          }
          return this.createSkipDecision(transaction, '无法获取费率信息');
        }
      }
      
      // 获取当前费率
      const currentFeeRate = transaction.feeRate;
      
      // 检查是否低于最低费率
      if (currentFeeRate < this.config.minFeeRate) {
        if (this.config.debug) {
          console.log(`[策略] 跳过低费率交易: ${transaction.txid}, 费率: ${currentFeeRate} sat/vB (最低要求: ${this.config.minFeeRate})`);
        }
        return this.createSkipDecision(transaction, '低于最低费率要求');
      }
      
      // 检查费率是否已经很高
      if (currentFeeRate > this.config.maxFeeRate) {
        if (this.config.debug) {
          console.log(`[策略] 跳过高费率交易: ${transaction.txid}, 费率: ${currentFeeRate} sat/vB (最高限制: ${this.config.maxFeeRate})`);
        }
        return this.createSkipDecision(transaction, '超过最高费率限制');
      }
      
      // 如果是关键竞争对手且配置了总是竞争
      const shouldCompete = 
        (transaction.isKeyCompetitor && this.config.alwaysCompeteWithKey) || 
        this.shouldCompeteBasedOnCurrentConditions(currentFeeRate);
      
      if (!shouldCompete) {
        if (this.config.debug) {
          console.log(`[策略] 基于当前网络条件决定不竞争: ${transaction.txid}, 费率: ${currentFeeRate} sat/vB`);
        }
        return this.createSkipDecision(transaction, '基于网络条件决定不竞争');
      }
      
      // 计算竞争费率
      const competitionFeeRate = this.calculateCompetitionFeeRate(currentFeeRate, transaction.isKeyCompetitor);
      
      // 检查计算的费率是否超过最高限制
      if (competitionFeeRate > this.config.maxFeeRate) {
        if (this.config.debug) {
          console.log(`[策略] 计算的竞争费率超过限制: ${competitionFeeRate} sat/vB > ${this.config.maxFeeRate} sat/vB`);
        }
        return this.createSkipDecision(transaction, '计算的竞争费率超过最高限制');
      }
      
      // 创建竞争决策结果
      const decision = {
        shouldCompete: true,
        originalTxid: transaction.txid,
        originalFeeRate: currentFeeRate,
        suggestedFeeRate: competitionFeeRate,
        isKeyCompetitor: !!transaction.isKeyCompetitor,
        timestamp: Date.now(),
        reason: transaction.isKeyCompetitor ? '关键竞争对手交易' : '一般竞争对手交易'
      };
      
      // 更新统计信息
      this.statistics.competitionsTriggered++;
      
      // 记录竞争历史
      this.competitionHistory.push(decision);
      
      // 修剪历史记录
      if (this.competitionHistory.length > 100) {
        this.competitionHistory = this.competitionHistory.slice(-100);
      }
      
      // 发出竞争事件
      this.emit('competition', decision);
      
      if (this.config.debug) {
        console.log(`[策略] 触发竞争: ${transaction.txid}, 原费率: ${currentFeeRate} sat/vB, 竞争费率: ${competitionFeeRate} sat/vB, 原因: ${decision.reason}`);
      }
      
      return decision;
    } catch (error) {
      if (this.config.debug) {
        console.error(`[策略] 评估交易出错: ${error.message}`);
      }
      
      // 发出错误事件
      this.emit('error', {
        source: 'strategy-engine',
        message: error.message,
        transaction,
        timestamp: Date.now()
      });
      
      // 返回跳过决策
      return this.createSkipDecision(transaction, `评估出错: ${error.message}`);
    }
  }
  
  /**
   * 基于当前网络条件判断是否应该参与竞争
   * @param {number} currentFeeRate - 当前交易费率
   * @returns {boolean} - 是否应该竞争
   */
  shouldCompeteBasedOnCurrentConditions(currentFeeRate) {
    // 获取当前网络的各种时间段的费率估计
    const estimates = this.feeSuggestions.estimates;
    
    // 如果没有费率估计数据，使用保守策略
    if (!estimates || Object.keys(estimates).length === 0) {
      return currentFeeRate >= this.config.minFeeRate * 1.2;
    }
    
    // 检查当前费率是否高于30分钟确认区块的费率
    // 如果高于，说明这是高优先级交易，值得竞争
    const thirtyMinRate = estimates['30'] || estimates['60'] || 0;
    if (thirtyMinRate > 0 && currentFeeRate >= thirtyMinRate) {
      return true;
    }
    
    // 如果当前费率高于60分钟确认但低于30分钟确认，只在特定条件下竞争
    const sixtyMinRate = estimates['60'] || estimates['120'] || 0;
    if (sixtyMinRate > 0 && currentFeeRate >= sixtyMinRate) {
      // 只有当前费率比最低费率高30%以上时才竞争
      return currentFeeRate >= this.config.minFeeRate * 1.3;
    }
    
    // 默认情况下，如果费率高于最低费率的50%，就竞争
    return currentFeeRate >= this.config.minFeeRate * 1.5;
  }
  
  /**
   * 计算竞争费率
   * @param {number} currentFeeRate - 当前交易费率
   * @param {boolean} isKeyCompetitor - 是否是关键竞争对手
   * @returns {number} - 计算的竞争费率
   */
  calculateCompetitionFeeRate(currentFeeRate, isKeyCompetitor) {
    // 基础加价百分比
    let bumpPercent = this.config.minFeeBumpPercent;
    
    // 关键竞争对手使用更高的加价
    if (isKeyCompetitor) {
      bumpPercent = Math.min(
        this.config.maxFeeBumpPercent,
        bumpPercent * 1.5
      );
    }
    
    // 根据当前网络拥堵程度调整加价
    const estimates = this.feeSuggestions.estimates;
    if (estimates && Object.keys(estimates).length > 0) {
      // 获取当前1个块和6个块的费率差异
      const oneBlockRate = estimates['1'] || 0;
      const sixBlockRate = estimates['6'] || 0;
      
      if (oneBlockRate > 0 && sixBlockRate > 0) {
        // 计算拥堵系数 (0-1之间)
        const congestionFactor = Math.min(1, Math.max(0, (oneBlockRate - sixBlockRate) / oneBlockRate));
        
        // 根据拥堵系数调整加价百分比
        const adjustedBump = bumpPercent + (this.config.maxFeeBumpPercent - bumpPercent) * congestionFactor;
        bumpPercent = Math.min(this.config.maxFeeBumpPercent, adjustedBump);
      }
    }
    
    // 计算竞争费率并确保在限制范围内
    let competitionFeeRate = currentFeeRate * (1 + bumpPercent / 100);
    
    // 确保不低于最低费率
    competitionFeeRate = Math.max(this.config.minFeeRate, competitionFeeRate);
    
    // 确保不超过最高费率
    competitionFeeRate = Math.min(this.config.maxFeeRate, competitionFeeRate);
    
    // 四舍五入到整数
    return Math.round(competitionFeeRate);
  }
  
  /**
   * 创建跳过竞争的决策结果
   * @param {Object} transaction - 交易信息
   * @param {string} reason - 跳过原因
   * @returns {Object} - 决策结果
   */
  createSkipDecision(transaction, reason) {
    const decision = {
      shouldCompete: false,
      originalTxid: transaction.txid,
      originalFeeRate: transaction.feeRate,
      timestamp: Date.now(),
      reason
    };
    
    // 更新统计信息
    this.statistics.competitionsSkipped++;
    
    return decision;
  }
  
  /**
   * 确保费率估计是最新的（不超过10分钟）
   */
  async ensureFreshFeeEstimates() {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    
    // 如果费率估计超过10分钟，更新它
    if (now - this.feeSuggestions.timestamp > tenMinutes) {
      await this.updateFeeEstimates();
    }
  }
  
  /**
   * 更新费率估计
   */
  async updateFeeEstimates() {
    try {
      const estimates = await this.apiClient.getFeeEstimates();
      
      this.feeSuggestions = {
        timestamp: Date.now(),
        estimates
      };
      
      if (this.config.debug) {
        console.log('[策略] 已更新费率估计:', estimates);
      }
    } catch (error) {
      console.error(`[策略] 更新费率估计失败: ${error.message}`);
      
      // 发出错误事件
      this.emit('error', {
        source: 'strategy-engine',
        message: `更新费率估计失败: ${error.message}`,
        timestamp: Date.now()
      });
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
   * 获取策略引擎状态
   */
  getStatus() {
    return {
      config: {
        selfAddress: this.config.selfAddress,
        minFeeBumpPercent: this.config.minFeeBumpPercent,
        maxFeeBumpPercent: this.config.maxFeeBumpPercent,
        maxFeeRate: this.config.maxFeeRate,
        minFeeRate: this.config.minFeeRate
      },
      feeSuggestions: this.feeSuggestions,
      statistics: this.statistics,
      recentCompetitions: this.competitionHistory.slice(-10)
    };
  }
  
  /**
   * 更新配置
   * @param {Object} newConfig - 新的配置对象
   */
  updateConfig(newConfig) {
    if (!newConfig) return;
    
    // 更新支持的配置项
    if (newConfig.selfAddress) {
      this.config.selfAddress = newConfig.selfAddress;
    }
    
    if (typeof newConfig.minFeeBumpPercent === 'number') {
      this.config.minFeeBumpPercent = newConfig.minFeeBumpPercent;
    }
    
    if (typeof newConfig.maxFeeBumpPercent === 'number') {
      this.config.maxFeeBumpPercent = newConfig.maxFeeBumpPercent;
    }
    
    if (typeof newConfig.maxFeeRate === 'number') {
      this.config.maxFeeRate = newConfig.maxFeeRate;
    }
    
    if (typeof newConfig.minFeeRate === 'number') {
      this.config.minFeeRate = newConfig.minFeeRate;
    }
    
    if (typeof newConfig.alwaysCompeteWithKey === 'boolean') {
      this.config.alwaysCompeteWithKey = newConfig.alwaysCompeteWithKey;
    }
    
    if (typeof newConfig.debug === 'boolean') {
      this.config.debug = newConfig.debug;
    }
    
    if (this.config.debug) {
      console.log('[策略] 配置已更新:', this.config);
    }
  }
}

module.exports = StrategyEngine; 