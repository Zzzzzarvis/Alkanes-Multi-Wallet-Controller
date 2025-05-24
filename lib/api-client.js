/**
 * API客户端
 * 负责与比特币区块链API进行通信，处理请求重试和负载均衡
 */

const axios = require('axios');
const EventEmitter = require('events');

class ApiClient extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // 默认配置
    this.config = {
      // 主要API端点
      primaryEndpoint: config.primaryEndpoint || 'https://blockstream.info/api',
      
      // 备用API端点列表
      backupEndpoints: config.backupEndpoints || [
        'https://mempool.space/api',
        'https://btc.com/service/api'
      ],
      
      // 请求超时(毫秒)
      timeout: config.timeout || 5000,
      
      // 最大重试次数
      maxRetries: config.maxRetries || 3,
      
      // 重试延迟(毫秒)
      retryDelay: config.retryDelay || 1000,
      
      // 请求间隔限制(毫秒)
      rateLimitDelay: config.rateLimitDelay || 1000,
      
      // 是否启用调试信息
      debug: config.debug || false
    };
    
    // 健康状态追踪
    this.endpointHealth = {
      primary: { failures: 0, lastSuccess: 0 },
      backup: this.config.backupEndpoints.map(() => ({ failures: 0, lastSuccess: 0 }))
    };
    
    // 速率限制追踪
    this.lastRequestTime = new Map(); // 地址/端点 -> 上次请求时间
    
    // 内部HTTP客户端
    this.client = axios.create({
      timeout: this.config.timeout
    });
    
    // 统计信息
    this.statistics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      primaryUsage: 0,
      backupUsage: []
    };
    
    // 初始化备用端点使用统计
    this.config.backupEndpoints.forEach(() => {
      this.statistics.backupUsage.push(0);
    });
  }
  
  /**
   * 执行API请求
   * @param {string} path - API路径
   * @param {Object} options - 请求选项
   * @param {string} context - 请求上下文(用于速率限制)
   * @param {number} retryCount - 当前重试次数
   * @returns {Promise<Object>} - API响应数据
   */
  async request(path, options = {}, context = '', retryCount = 0) {
    // 判断是否需要应用速率限制
    if (context) {
      const now = Date.now();
      const lastRequest = this.lastRequestTime.get(context) || 0;
      const timeSinceLastRequest = now - lastRequest;
      
      if (timeSinceLastRequest < this.config.rateLimitDelay) {
        const waitTime = this.config.rateLimitDelay - timeSinceLastRequest;
        
        if (this.config.debug) {
          console.log(`API限流：${context} 需等待 ${waitTime}ms 后才能再次请求`);
        }
        
        // 等待适当的时间
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // 更新上次请求时间
      this.lastRequestTime.set(context, Date.now());
    }
    
    // 选择API端点
    const endpoint = this.selectEndpoint();
    const url = `${endpoint}${path}`;
    
    try {
      this.statistics.totalRequests++;
      
      // 记录请求端点使用情况
      if (endpoint === this.config.primaryEndpoint) {
        this.statistics.primaryUsage++;
      } else {
        const index = this.config.backupEndpoints.indexOf(endpoint);
        if (index !== -1) {
          this.statistics.backupUsage[index]++;
        }
      }
      
      // 发送请求
      const response = await this.client.request({
        url,
        method: options.method || 'GET',
        data: options.data,
        params: options.params,
        headers: options.headers || {
          'Content-Type': 'application/json'
        }
      });
      
      // 更新端点健康状态
      this.updateEndpointHealth(endpoint, true);
      
      // 更新统计
      this.statistics.successfulRequests++;
      
      // 返回响应数据
      return response.data;
    } catch (error) {
      // 更新端点健康状态
      this.updateEndpointHealth(endpoint, false);
      
      // 更新统计
      this.statistics.failedRequests++;
      
      // 获取错误消息
      const errorMessage = error.response ? 
        `API请求失败：${error.response.status} ${error.response.statusText}` : 
        `API请求错误: ${error.message}`;
      
      // 检查是否可以重试
      if (retryCount < this.config.maxRetries) {
        this.statistics.retriedRequests++;
        
        // 计算重试延迟(使用指数退避)
        const delay = this.config.retryDelay * Math.pow(2, retryCount);
        
        if (this.config.debug) {
          console.log(`${errorMessage}，将在 ${delay}ms 后重试(${retryCount + 1}/${this.config.maxRetries})`);
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // 递归重试请求(不使用已失败的端点)
        return this.request(path, options, context, retryCount + 1);
      }
      
      // 已达到最大重试次数
      this.emit('error', {
        source: 'api-client',
        message: errorMessage,
        path,
        endpoint,
        context,
        timestamp: Date.now()
      });
      
      // 抛出错误
      throw new Error(`${errorMessage} (已重试 ${retryCount} 次)`);
    }
  }
  
  /**
   * 选择最健康的API端点
   * @returns {string} - 选择的API端点
   */
  selectEndpoint() {
    // 检查主要端点健康状态
    if (this.endpointHealth.primary.failures < 3) {
      return this.config.primaryEndpoint;
    }
    
    // 如果主要端点不健康，查找最健康的备用端点
    let bestBackupIndex = -1;
    let lowestFailures = Infinity;
    
    for (let i = 0; i < this.config.backupEndpoints.length; i++) {
      const health = this.endpointHealth.backup[i];
      
      if (health.failures < lowestFailures) {
        lowestFailures = health.failures;
        bestBackupIndex = i;
      }
    }
    
    // 如果找到健康的备用端点，使用它
    if (bestBackupIndex !== -1) {
      return this.config.backupEndpoints[bestBackupIndex];
    }
    
    // 如果所有端点都不健康，重置失败计数并使用主要端点
    this.resetEndpointHealth();
    return this.config.primaryEndpoint;
  }
  
  /**
   * 更新端点健康状态
   * @param {string} endpoint - API端点
   * @param {boolean} success - 请求是否成功
   */
  updateEndpointHealth(endpoint, success) {
    if (endpoint === this.config.primaryEndpoint) {
      // 更新主要端点健康状态
      if (success) {
        this.endpointHealth.primary.failures = 0;
        this.endpointHealth.primary.lastSuccess = Date.now();
      } else {
        this.endpointHealth.primary.failures++;
      }
    } else {
      // 更新备用端点健康状态
      const index = this.config.backupEndpoints.indexOf(endpoint);
      if (index !== -1) {
        if (success) {
          this.endpointHealth.backup[index].failures = 0;
          this.endpointHealth.backup[index].lastSuccess = Date.now();
        } else {
          this.endpointHealth.backup[index].failures++;
        }
      }
    }
    
    // 如果已经过去了10分钟，重置所有端点的失败计数
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    if (this.endpointHealth.primary.lastSuccess < tenMinutesAgo) {
      this.resetEndpointHealth();
    }
  }
  
  /**
   * 重置所有端点的健康状态
   */
  resetEndpointHealth() {
    this.endpointHealth.primary.failures = 0;
    
    for (let i = 0; i < this.endpointHealth.backup.length; i++) {
      this.endpointHealth.backup[i].failures = 0;
    }
    
    if (this.config.debug) {
      console.log('已重置所有API端点的健康状态');
    }
  }
  
  /**
   * 获取地址的交易
   * @param {string} address - 比特币地址
   * @returns {Promise<Array>} - 交易列表
   */
  async getAddressTransactions(address) {
    return this.request(
      `/address/${address}/txs`, 
      { params: { limit: 10 } },
      `address-${address}`
    );
  }
  
  /**
   * 获取交易详情
   * @param {string} txid - 交易ID
   * @returns {Promise<Object>} - 交易详情
   */
  async getTransaction(txid) {
    return this.request(
      `/tx/${txid}`,
      {},
      `tx-${txid}`
    );
  }
  
  /**
   * 获取内存池交易
   * @returns {Promise<Array>} - 内存池交易列表
   */
  async getMempoolTransactions() {
    return this.request('/mempool/recent', {}, 'mempool');
  }
  
  /**
   * 获取当前推荐费率
   * @returns {Promise<Object>} - 费率信息
   */
  async getFeeEstimates() {
    return this.request('/fee-estimates', {}, 'fees');
  }
  
  /**
   * 获取API客户端状态
   * @returns {Object} - 状态信息
   */
  getStatus() {
    return {
      endpoints: {
        primary: {
          url: this.config.primaryEndpoint,
          health: this.endpointHealth.primary
        },
        backup: this.config.backupEndpoints.map((url, index) => ({
          url,
          health: this.endpointHealth.backup[index]
        }))
      },
      statistics: this.statistics
    };
  }
}

module.exports = ApiClient; 