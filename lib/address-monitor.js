/**
 * 地址监控器
 * 负责监控比特币地址的交易活动，识别竞争对手的交易
 */

const EventEmitter = require('events');

class AddressMonitor extends EventEmitter {
  constructor(apiClient, config = {}) {
    super();
    
    // 保存依赖和配置
    this.apiClient = apiClient;
    this.config = {
      keyCompetitors: config.keyCompetitors || [],
      competitors: config.competitors || [],
      keyCompetitorInterval: config.keyCompetitorInterval || 3000,
      regularCompetitorInterval: config.regularCompetitorInterval || 6000,
      debug: config.debug || false
    };
    
    // 状态变量
    this.active = false;
    this.keyCompetitorInterval = null;
    this.regularCompetitorInterval = null;
    this.lastTxids = new Map();
    this.lastCheckTimes = new Map();
    this.statistics = {
      totalChecks: 0,
      newTransactions: 0,
      errorCount: 0
    };
    
    // 绑定方法上下文
    this.checkKeyCompetitors = this.checkKeyCompetitors.bind(this);
    this.checkRegularCompetitors = this.checkRegularCompetitors.bind(this);
    this.checkAddress = this.checkAddress.bind(this);
  }
  
  start() {
    if (this.active) return;
    
    this.active = true;
    
    const hasKeyCompetitors = this.config.keyCompetitors.length > 0;
    const hasRegularCompetitors = this.config.competitors.length > 0;
    
    if (!hasKeyCompetitors && !hasRegularCompetitors) {
      if (this.config.debug) console.log('地址监控器没有要监控的地址，不会启动');
      return;
    }
    
    this.initLastTxids();
    
    if (hasKeyCompetitors) {
      this.checkKeyCompetitors();
      this.keyCompetitorInterval = setInterval(
        this.checkKeyCompetitors, 
        this.config.keyCompetitorInterval
      );
      
      if (this.config.debug) {
        console.log(`关键竞争对手监控已启动，地址数: ${this.config.keyCompetitors.length}, 间隔: ${this.config.keyCompetitorInterval}ms`);
      }
    }
    
    if (hasRegularCompetitors) {
      setTimeout(() => {
        this.checkRegularCompetitors();
        this.regularCompetitorInterval = setInterval(
          this.checkRegularCompetitors, 
          this.config.regularCompetitorInterval
        );
      }, 1000);
      
      if (this.config.debug) {
        console.log(`一般竞争对手监控已启动，地址数: ${this.config.competitors.length}, 间隔: ${this.config.regularCompetitorInterval}ms`);
      }
    }
  }
  
  stop() {
    if (!this.active) return;
    
    this.active = false;
    
    if (this.keyCompetitorInterval) {
      clearInterval(this.keyCompetitorInterval);
      this.keyCompetitorInterval = null;
    }
    
    if (this.regularCompetitorInterval) {
      clearInterval(this.regularCompetitorInterval);
      this.regularCompetitorInterval = null;
    }
    
    if (this.config.debug) console.log('地址监控器已停止');
  }
  
  initLastTxids() {
    this.lastTxids.clear();
    this.lastCheckTimes.clear();
    
    [...this.config.keyCompetitors, ...this.config.competitors].forEach(address => {
      this.lastTxids.set(address, new Set());
      this.lastCheckTimes.set(address, 0);
    });
  }
  
  async checkKeyCompetitors() {
    if (!this.active || this.config.keyCompetitors.length === 0) return;
    
    for (const address of this.config.keyCompetitors) {
      await this.checkAddress(address, true);
    }
  }
  
  async checkRegularCompetitors() {
    if (!this.active || this.config.competitors.length === 0) return;
    
    for (const address of this.config.competitors) {
      await this.checkAddress(address, false);
    }
  }
  
  async checkAddress(address, isKeyCompetitor) {
    if (!this.active) return;
    
    try {
      const transactions = await this.apiClient.getAddressTransactions(address);
      
      this.statistics.totalChecks++;
      
      let lastTxids = this.lastTxids.get(address);
      if (!lastTxids) {
        lastTxids = new Set();
        this.lastTxids.set(address, lastTxids);
      }
      
      const newTxs = [];
      if (transactions && transactions.length > 0) {
        for (const tx of transactions) {
          if (tx.txid && !lastTxids.has(tx.txid)) {
            newTxs.push(tx);
            lastTxids.add(tx.txid);
          }
        }
      }
      
      this.lastCheckTimes.set(address, Date.now());
      
      if (newTxs.length > 0) {
        this.statistics.newTransactions += newTxs.length;
        
        for (const tx of newTxs) {
          const feeRate = this.calculateFeeRate(tx);
          
          this.emit('transaction', {
            txid: tx.txid,
            address,
            feeRate,
            isKeyCompetitor,
            timestamp: Date.now(),
            source: 'address-monitor'
          });
          
          if (this.config.debug) {
            console.log(`[${isKeyCompetitor ? '关键' : '一般'}竞争对手] 发现新交易: ${tx.txid}, 地址: ${address}, 费率: ${feeRate} sat/vB`);
          }
        }
      }
    } catch (error) {
      this.statistics.errorCount++;
      
      this.emit('error', {
        source: 'address-monitor',
        address,
        message: error.message,
        timestamp: Date.now()
      });
      
      console.error(`检查地址 ${address} 时出错: ${error.message}`);
    }
  }
  
  calculateFeeRate(tx) {
    try {
      if (tx.fee_rate) return parseFloat(tx.fee_rate);
      
      if (tx.fee !== undefined && tx.vsize) {
        return parseFloat((tx.fee / tx.vsize).toFixed(2));
      }
      
      if (tx.fee !== undefined && tx.size) {
        return parseFloat((tx.fee / tx.size).toFixed(2));
      }
      
      return 50;
    } catch (error) {
      console.error(`计算费率时出错: ${error.message}`);
      return 50;
    }
  }
  
  getStatus() {
    return {
      active: this.active,
      keyCompetitorsCount: this.config.keyCompetitors.length,
      regularCompetitorsCount: this.config.competitors.length,
      lastCheckTimes: Object.fromEntries(this.lastCheckTimes),
      statistics: this.statistics
    };
  }
  
  addAddress(address, isKeyCompetitor = false) {
    if (isKeyCompetitor) {
      if (!this.config.keyCompetitors.includes(address)) {
        this.config.keyCompetitors.push(address);
        this.lastTxids.set(address, new Set());
        this.lastCheckTimes.set(address, 0);
      }
    } else {
      if (!this.config.competitors.includes(address)) {
        this.config.competitors.push(address);
        this.lastTxids.set(address, new Set());
        this.lastCheckTimes.set(address, 0);
      }
    }
  }
  
  removeAddress(address) {
    this.config.keyCompetitors = this.config.keyCompetitors.filter(a => a !== address);
    this.config.competitors = this.config.competitors.filter(a => a !== address);
    this.lastTxids.delete(address);
    this.lastCheckTimes.delete(address);
  }
}

module.exports = AddressMonitor; 