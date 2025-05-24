#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 敏感文件模式
const SENSITIVE_PATTERNS = [
    /\.env$/,
    /\.env\..+/,
    /.*private.*key.*/i,
    /.*secret.*/i,
    /.*mnemonic.*/i,
    /wallet_addresses\.json$/
];

// 敏感内容模式
const SENSITIVE_CONTENT_PATTERNS = [
    /SANDSHREW_PROJECT_ID\s*=\s*[a-f0-9-]{30,}/i,
    /WALLET_MNEMONIC\s*=\s*\w+(\s+\w+){11,}/i,
    /private.*key/i,
    /[a-f0-9]{64}/  // 可能的私钥
];

function checkGitignore() {
    const gitignorePath = '.gitignore';
    
    if (!fs.existsSync(gitignorePath)) {
        console.log('❌ 未找到 .gitignore 文件!');
        return false;
    }
    
    const content = fs.readFileSync(gitignorePath, 'utf8');
    const requiredPatterns = ['.env', '.env.*', '.env.wallet*'];
    
    for (const pattern of requiredPatterns) {
        if (!content.includes(pattern)) {
            console.log(`❌ .gitignore 缺少模式: ${pattern}`);
            return false;
        }
    }
    
    console.log('✅ .gitignore 配置正确');
    return true;
}

function scanDirectory(dir = '.', depth = 0) {
    const issues = [];
    const maxDepth = 3; // 限制扫描深度
    
    if (depth > maxDepth) return issues;
    
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        // 跳过 .git 和 node_modules
        if (item === '.git' || item === 'node_modules') continue;
        
        if (stat.isDirectory()) {
            issues.push(...scanDirectory(fullPath, depth + 1));
        } else {
            // 检查文件名
            for (const pattern of SENSITIVE_PATTERNS) {
                if (pattern.test(item)) {
                    issues.push({
                        type: 'sensitive_file',
                        path: fullPath,
                        reason: `敏感文件名: ${item}`
                    });
                }
            }
            
            // 检查文件内容（仅检查小文件）
            if (stat.size < 100000) { // 小于100KB
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    for (const pattern of SENSITIVE_CONTENT_PATTERNS) {
                        if (pattern.test(content)) {
                            issues.push({
                                type: 'sensitive_content',
                                path: fullPath,
                                reason: '文件包含敏感内容'
                            });
                            break;
                        }
                    }
                } catch (e) {
                    // 忽略二进制文件等读取错误
                }
            }
        }
    }
    
    return issues;
}

function main() {
    console.log('🔍 多钱包群控器安全检查');
    console.log('='.repeat(50));
    
    // 检查 .gitignore
    const gitignoreOk = checkGitignore();
    
    // 扫描敏感文件
    console.log('\n🔍 扫描敏感文件...');
    const issues = scanDirectory();
    
    if (issues.length === 0) {
        console.log('✅ 未发现敏感文件或内容');
    } else {
        console.log(`❌ 发现 ${issues.length} 个问题:`);
        issues.forEach((issue, index) => {
            console.log(`${index + 1}. ${issue.path}: ${issue.reason}`);
        });
    }
    
    // 给出建议
    console.log('\n📋 上传前检查清单:');
    console.log('1. ✅ 确认 .gitignore 包含所有敏感文件模式');
    console.log('2. ✅ 检查代码中没有硬编码的API密钥或助记词');
    console.log('3. ✅ 确认没有 .env.wallet* 文件被追踪');
    console.log('4. ✅ 验证 README.md 不包含真实的配置信息');
    
    if (!gitignoreOk || issues.length > 0) {
        console.log('\n⚠️  请解决上述问题后再上传到GitHub!');
        process.exit(1);
    } else {
        console.log('\n🎉 安全检查通过，可以安全上传到GitHub!');
    }
}

main(); 