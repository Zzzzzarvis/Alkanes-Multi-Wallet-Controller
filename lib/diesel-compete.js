/**
 * Diesel-Compete 主模块
 * 集成各个组件，提供统一的交易竞争框架
 */

const EventEmitter = require('events');
const ApiClient = require('./api-client');
const AddressMonitor = require('./address-monitor');
const MempoolMonitor = require('./mempool-monitor');
const StrategyEngine = require('./strategy-engine');

class DieselCompete extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // 基础配置
    this.config = {
      // 启用地址监控
      enableAddressMonitor: config.enableAddressMonitor !== false,
      
      // 启用内存池监控
      enableMempoolMonitor: config.enableMempoolMonitor !== false,
      
      // 自身地址（用于防止与自己竞争）
      selfAddress: config.selfAddress || '',
      
      // 关键竞争对手地址列表
      keyCompetitors: config.keyCompetitors || [],
      
      // 一般竞争对手地址列表
      competitors: config.competitors || [],
      
      // API配置
      api: config.api || {},
      
      // 地址监控配置
      addressMonitor: config.addressMonitor || {},
      
      // 内存池监控配置
      mempoolMonitor: config.mempoolMonitor || {},
      
      // 策略引擎配置
      strategyEngine: config.strategyEngine || {},
      
      // 是否启用调试信息
      debug: config.debug || false
    };
    
    // 初始化API客户端
    this.apiClient = new ApiClient(Object.assign(
      { debug: this.config.debug },
      this.config.api
    ));
    
    // 初始化策略引擎
    this.strategyEngine = new StrategyEngine(this.apiClient, Object.assign(
      { 
        debug: this.config.debug,
        selfAddress: this.config.selfAddress
      },
      this.config.strategyEngine
    ));
    
    // 初始化地址监控器
    if (this.config.enableAddressMonitor) {
      this.addressMonitor = new AddressMonitor(this.apiClient, Object.assign(
        { 
          debug: this.config.debug,
          keyCompetitors: this.config.keyCompetitors,
          competitors: this.config.competitors
        },
        this.config.addressMonitor
      ));
    }
    
    // 初始化内存池监控器
    if (this.config.enableMempoolMonitor) {
      this.mempoolMonitor = new MempoolMonitor(this.apiClient, Object.assign(
        { debug: this.config.debug },
        this.config.mempoolMonitor
      ));
    }
    
    // 状态变量
    this.active = false;
    
    // 绑定事件和方法
    this.bindEvents();
  }
  
  /**
   * 绑定组件事件
   */
  bindEvents() {
    // 绑定API客户端错误
    this.apiClient.on('error', (error) => {
      this.emit('error', error);
    });
    
    // 绑定策略引擎事件
    this.strategyEngine.on('competition', (competition) => {
      this.emit('competition', competition);
    });
    
    this.strategyEngine.on('error', (error) => {
      this.emit('error', error);
    });
    
    // 绑定地址监控器事件
    if (this.addressMonitor) {
      this.addressMonitor.on('transaction', async (transaction) => {
        // 发出交易事件
        this.emit('transaction', transaction);
        
        // 评估是否需要竞争
        try {
          const decision = await this.strategyEngine.evaluateTransaction(transaction);
          
          // 如果需要竞争，已在策略引擎中触发competition事件
          if (!decision.shouldCompete && this.config.debug) {
            console.log(`[地址交易] 决定不竞争: ${transaction.txid}, 原因: ${decision.reason}`);
          }
        } catch (error) {
          console.error(`评估地址交易时出错: ${error.message}`);
          this.emit('error', {
            source: 'diesel-compete',
            message: `评估地址交易时出错: ${error.message}`,
            transaction,
            timestamp: Date.now()
          });
        }
      });
      
      this.addressMonitor.on('error', (error) => {
        this.emit('error', error);
      });
    }
    
    // 绑定内存池监控器事件
    if (this.mempoolMonitor) {
      this.mempoolMonitor.on('transaction', async (transaction) => {
        // 发出交易事件
        this.emit('transaction', transaction);
        
        // 评估是否需要竞争
        try {
          const decision = await this.strategyEngine.evaluateTransaction(transaction);
          
          // 如果需要竞争，已在策略引擎中触发competition事件
          if (!decision.shouldCompete && this.config.debug) {
            console.log(`[内存池交易] 决定不竞争: ${transaction.txid}, 原因: ${decision.reason}`);
          }
        } catch (error) {
          console.error(`评估内存池交易时出错: ${error.message}`);
          this.emit('error', {
            source: 'diesel-compete',
            message: `评估内存池交易时出错: ${error.message}`,
            transaction,
            timestamp: Date.now()
          });
        }
      });
      
      this.mempoolMonitor.on('error', (error) => {
        this.emit('error', error);
      });
    }
  }
  
  /**
   * 启动Diesel-Compete
   */
  start() {
    if (this.active) {
      console.log('Diesel-Compete已经在运行中');
      return;
    }
    
    this.active = true;
    
    if (this.config.debug) {
      console.log('正在启动Diesel-Compete...');
    }
    
    // 启动地址监控器
    if (this.addressMonitor && this.config.enableAddressMonitor) {
      this.addressMonitor.start();
      if (this.config.debug) {
        console.log('地址监控器已启动');
      }
    }
    
    // 启动内存池监控器
    if (this.mempoolMonitor && this.config.enableMempoolMonitor) {
      this.mempoolMonitor.start();
      if (this.config.debug) {
        console.log('内存池监控器已启动');
      }
    }
    
    if (this.config.debug) {
      console.log('Diesel-Compete启动完成');
    }
    
    // 发出启动事件
    this.emit('started', {
      timestamp: Date.now(),
      config: {
        addressMonitorEnabled: !!(this.addressMonitor && this.config.enableAddressMonitor),
        mempoolMonitorEnabled: !!(this.mempoolMonitor && this.config.enableMempoolMonitor)
      }
    });
  }
  
  /**
   * 停止Diesel-Compete
   */
  stop() {
    if (!this.active) {
      console.log('Diesel-Compete未在运行');
      return;
    }
    
    if (this.config.debug) {
      console.log('正在停止Diesel-Compete...');
    }
    
    // 停止地址监控器
    if (this.addressMonitor) {
      this.addressMonitor.stop();
      if (this.config.debug) {
        console.log('地址监控器已停止');
      }
    }
    
    // 停止内存池监控器
    if (this.mempoolMonitor) {
      this.mempoolMonitor.stop();
      if (this.config.debug) {
        console.log('内存池监控器已停止');
      }
    }
    
    this.active = false;
    
    if (this.config.debug) {
      console.log('Diesel-Compete已完全停止');
    }
    
    // 发出停止事件
    this.emit('stopped', {
      timestamp: Date.now()
    });
  }
  
  /**
   * 获取系统状态
   * @returns {Object} - 系统状态
   */
  getStatus() {
    const status = {
      active: this.active,
      api: this.apiClient.getStatus(),
      strategy: this.strategyEngine.getStatus(),
      addressMonitor: this.addressMonitor ? this.addressMonitor.getStatus() : null,
      mempoolMonitor: this.mempoolMonitor ? this.mempoolMonitor.getStatus() : null,
      timestamp: Date.now()
    };
    
    return status;
  }
  
  /**
   * 更新配置
   * @param {Object} newConfig - 新的配置对象
   */
  updateConfig(newConfig) {
    if (!newConfig) return;
    
    const needRestart = this.active && (
      newConfig.enableAddressMonitor !== undefined && newConfig.enableAddressMonitor !== this.config.enableAddressMonitor ||
      newConfig.enableMempoolMonitor !== undefined && newConfig.enableMempoolMonitor !== this.config.enableMempoolMonitor
    );
    
    // 如果需要重启，先停止
    if (needRestart) {
      this.stop();
    }
    
    // 更新基本配置
    if (newConfig.selfAddress !== undefined) {
      this.config.selfAddress = newConfig.selfAddress;
    }
    
    if (newConfig.enableAddressMonitor !== undefined) {
      this.config.enableAddressMonitor = newConfig.enableAddressMonitor;
    }
    
    if (newConfig.enableMempoolMonitor !== undefined) {
      this.config.enableMempoolMonitor = newConfig.enableMempoolMonitor;
    }
    
    if (newConfig.debug !== undefined) {
      this.config.debug = newConfig.debug;
    }
    
    // 更新子组件配置
    if (newConfig.keyCompetitors) {
      this.config.keyCompetitors = newConfig.keyCompetitors;
      if (this.addressMonitor) {
        // 更新地址监控器的竞争对手列表
        this.addressMonitor.config.keyCompetitors = newConfig.keyCompetitors;
      }
    }
    
    if (newConfig.competitors) {
      this.config.competitors = newConfig.competitors;
      if (this.addressMonitor) {
        // 更新地址监控器的竞争对手列表
        this.addressMonitor.config.competitors = newConfig.competitors;
      }
    }
    
    // 更新策略引擎配置
    if (newConfig.strategyEngine) {
      this.strategyEngine.updateConfig(Object.assign(
        { selfAddress: this.config.selfAddress },
        newConfig.strategyEngine
      ));
    }
    
    // 更新内存池监控器配置
    if (this.mempoolMonitor && newConfig.mempoolMonitor) {
      if (newConfig.mempoolMonitor.minFeeRate !== undefined) {
        this.mempoolMonitor.updateMinFeeRate(newConfig.mempoolMonitor.minFeeRate);
      }
    }
    
    if (this.config.debug) {
      console.log('Diesel-Compete配置已更新');
    }
    
    // 如果需要重启，重新启动
    if (needRestart) {
      this.start();
    }
  }
  
  /**
   * 添加竞争对手地址
   * @param {string} address - 比特币地址
   * @param {boolean} isKeyCompetitor - 是否为关键竞争对手
   */
  addCompetitorAddress(address, isKeyCompetitor = false) {
    if (!address) return;
    
    // 更新配置
    if (isKeyCompetitor) {
      if (!this.config.keyCompetitors.includes(address)) {
        this.config.keyCompetitors.push(address);
      }
    } else {
      if (!this.config.competitors.includes(address)) {
        this.config.competitors.push(address);
      }
    }
    
    // 更新地址监控器
    if (this.addressMonitor) {
      this.addressMonitor.addAddress(address, isKeyCompetitor);
    }
    
    if (this.config.debug) {
      console.log(`已添加${isKeyCompetitor ? '关键' : '一般'}竞争对手地址: ${address}`);
    }
  }
  
  /**
   * 移除竞争对手地址
   * @param {string} address - 比特币地址
   */
  removeCompetitorAddress(address) {
    if (!address) return;
    
    // 从配置中移除
    this.config.keyCompetitors = this.config.keyCompetitors.filter(a => a !== address);
    this.config.competitors = this.config.competitors.filter(a => a !== address);
    
    // 从地址监控器中移除
    if (this.addressMonitor) {
      this.addressMonitor.removeAddress(address);
    }
    
    if (this.config.debug) {
      console.log(`已移除竞争对手地址: ${address}`);
    }
  }
}

module.exports = DieselCompete; 