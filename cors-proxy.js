#!/usr/bin/env node
/**
 * SBTI 本地 CORS 代理
 *
 * 用法:   node cors-proxy.js [端口]
 * 默认端口: 9876
 *
 * 原理:
 *   浏览器 → http://localhost:9876/proxy?url=<目标URL>
 *            → 代理转发到目标 API → 返回并附加 CORS 头
 *
 * 注意: 这只是一个本地开发/测试工具，不要部署到公网！
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = parseInt(process.argv[2]) || 9876;

const server = http.createServer(async (req, res) => {
  // CORS headers — 允许所有来源
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');

  // 处理 preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 解析目标 URL
  const parsed = url.parse(req.url, true);
  const targetUrl = parsed.query.url;

  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '缺少 url 参数。用法: /proxy?url=https://xxx/v1/chat/completions' }));
    return;
  }

  // 读取请求体
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  // 转发请求
  const target = new URL(targetUrl);
  const isHttps = target.protocol === 'https:';
  const lib = isHttps ? https : http;

  const forwardHeaders = { ...req.headers };
  delete forwardHeaders['host'];
  delete forwardHeaders['origin'];
  delete forwardHeaders['referer'];
  forwardHeaders['host'] = target.host;
  if (body.length > 0) {
    forwardHeaders['content-length'] = body.length;
  }

  const options = {
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    path: target.pathname + target.search,
    method: req.method,
    headers: forwardHeaders
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    // 复制响应头，但替换 CORS 头
    const responseHeaders = { ...proxyRes.headers };
    responseHeaders['access-control-allow-origin'] = '*';
    delete responseHeaders['access-control-allow-credentials'];

    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[代理错误] ${targetUrl}: ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `代理连接失败: ${err.message}` }));
  });

  if (body.length > 0) proxyReq.write(body);
  proxyReq.end();

  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} → ${targetUrl}`);
});

server.listen(PORT, () => {
  console.log(`\n  🔌 SBTI CORS 代理已启动`);
  console.log(`  ─────────────────────────────`);
  console.log(`  监听地址: http://localhost:${PORT}`);
  console.log(`  代理端点: http://localhost:${PORT}/proxy?url=<目标URL>`);
  console.log(`\n  在 model-test.html 配置页面中勾选 "启用 CORS 代理" 即可使用`);
  console.log(`  按 Ctrl+C 停止\n`);
});
