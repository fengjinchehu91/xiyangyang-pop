# 喜羊羊 XIYANGYANG 部署说明

更新日期：2026-10-19。网站已发布至 https://xiyangyang-pop.pages.dev/ 。当前为只读网站，不需要数据库、钱包私钥或合约部署。

## 当前生产部署（优先）

为改善手机网络下数据读取，生产版本增加了 Cloudflare Pages Functions：`functions/api/rpc.ts`、`history.ts`、`pop-price.ts`。请沿用 GitHub 集成从仓库根目录构建，命令 `npm run build`、输出目录 `dist`、根目录留空。Cloudflare 自动打包根目录的 `functions/`；部署日志应同时出现函数编译成功。`dist/_routes.json` 将函数范围限制为 `/api/*`。

保持 `VITE_BSC_RPC_URL`、`VITE_BSC_HISTORY_RPC_URL`、`VITE_POP_QUOTE_URL` 留空，生产网站会访问同域接口；其上游固定且只允许已核实的只读查询。设置为外部 URL 会恢复浏览器直连，需要访客网络可达和 CORS，可能重现手机读取问题。失败保留“暂未获取”及重试，不显示零余额。

报价使用 DEX Screener，受限时切至独立 GeckoTerminal，同池校验不放宽，页面来源链接反映实际供应商。保留报价获取时间并缓存成功结果 15 秒；每个供应商遇到 429 按 `Retry-After` 且至少冷却 60 秒，不绕过限流。Cache API 可同区域共享，模块缓存仅限当前 isolate；公开 API 仍存在全局限流风险，不承诺无限流量。

行情接口不可用时，最后备用为同池链上现货价乘以 Chainlink USDT/USD 参考喂价，不是 POP 直接预言机。固定池、Oracle、实际精度和同区块轮次／时效均校验，不新增资金操作；不合格即保留美元数据不可用。Chainlink 代理 `0xB97Ad0E74fa7d920791E90258A6E2085088b4320` 来自官方 BNB 主网资料（900 秒心跳、8 位输出），池价格仍具有现货波动和操纵风险。核实资料见 [Chainlink 地址目录](https://docs.chain.link/data-feeds/price-feeds/addresses) 和该页指向的 [BNB 主网 RDD](https://reference-data-directory.vercel.app/feeds-bsc-mainnet.json)。

**以下静态包交付说明属于旧版。旧 `release/` 和桌面压缩包不包含本次同源接口修复。仅上传静态 `dist/` 无法部署当前数据接口，不应据此覆盖现有生产站点。** 若迁移到不支持 Pages Functions 的主机，需要同时提供相同的只读 API，或显式配置全部外部直连 URL 后重新构建。

## 交付文件

- `release/xiyangyang-source.zip`：完整 React / TypeScript 源码、品牌素材、字体授权、依赖锁文件、测试、配置示例、核实资料及本文档。不包含 `node_modules`、本地环境文件或构建缓存。
- `release/xiyangyang-static.zip`：已构建的网站文件，可直接上传至静态网站空间。解压后根目录直接有 `index.html`、`assets/`、`brand/`、`fonts/`。
- `release/SHA256SUMS.txt`：两个压缩包的 SHA-256 校验值。

源码包用于后续维护或交给开发人员；静态包用于直接上线，无须在服务器运行 Node.js。

## 方式一：直接上传静态包

适合宝塔纯静态网站、Nginx、Apache 或支持上传静态文件的托管平台。

1. 创建站点并绑定自己的域名。
2. 解压 `xiyangyang-static.zip`，把解压得到的内容放到网站根目录。根目录应直接存在 `index.html`，不要额外套一层 `dist/` 或压缩包名称目录。
3. 使用 `index.html` 作为默认首页，并启用 HTTPS。
4. 访问 `https://你的域名/`，检查品牌图片、数据、复制按钮、语言切换和手机菜单。

当前版本按域名根目录构建，例如 `https://example.com/`。**不要直接放在 `/xiyangyang/` 等子目录下**：脚本、品牌素材和字体使用根目录路径。若必须部署到子目录，需要同时调整 Vite 的 base 和源码中的品牌、字体资源路径，再重新构建；只修改 base 不足以完成适配。

页面使用 `#home`、`#treasury` 等锚点导航，没有依赖服务器路由重写。不要用开发服务器 `npm run dev` 或预览服务器 `npm run preview` 承担正式生产服务。

## 方式二：从源码构建

解压源码包到独立项目文件夹。建议使用已经验证的 Node.js 24；Vite 也支持符合其要求的 Node.js 22.12+。

在包含 `package.json` 的目录执行：

```sh
npm ci --include=dev
npm test
npm run build
```

构建产物在 `dist/`。将 **dist 内部所有文件和目录** 上传到网站根目录。

本地查看源码开发版：

```sh
npm run dev
```

本地检查生产构建：

```sh
npm run preview
```

这两条预览命令均不自动发布。

## 代码托管平台构建参数

如果使用支持 Vite 的静态托管构建服务，配置：

| 参数 | 值 |
| --- | --- |
| Node.js | 24 |
| 项目根目录 | 含 `package.json` 的目录 |
| 安装命令 | `npm ci --include=dev` |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |

没有服务端启动命令，没有钱包连接要求。部署账号、域名与 DNS 操作由站点所有者完成。

## RPC 与报价配置

默认配置已包含核实过的代币、金库、回购接收地址以及公开读取节点；开箱可读。公开节点和报价服务不提供本项目的可用性保证，正式上线建议使用允许浏览器跨域访问、可限制来源域名的生产读节点。

如需调整，将 `.env.example` 中所需的公开配置设置到构建平台环境变量，或在本地 `.env.local` 中配置，然后重新构建：

```dotenv
VITE_BSC_RPC_URL=https://bsc-dataseed.binance.org
VITE_BSC_HISTORY_RPC_URL=https://rpc-bsc.48.club
```

- 两个 RPC 均须为 BNB Smart Chain，Chain ID 56；历史节点还需支持每段 5000 区块的 `eth_getLogs`。
- 节点须允许网站浏览器 Origin 的 CORS POST / OPTIONS 请求，不能只是服务器终端可以访问。
- `VITE_*` 会写入浏览器 JavaScript，**不可填入私钥、服务端密钥或不能公开的凭据**。
- 修改配置后重新执行 `npm run build` 并更新静态产物。向已经构建好的站点上传 `.env` 不会改变其运行配置，也不应公开本地环境文件。
- POP/USD 报价适配器位于 `src/config/quotes.ts`，当前访问 `https://api.dexscreener.com`。报价不可用时保留 POP 数量，不编造美元数值。
- 若主机自行配置 Content Security Policy，其 `connect-src` 需放行实际使用的两个 RPC 域名和 `https://api.dexscreener.com`。不要为了排障直接禁用所有安全策略。

## 上线前检查

- HTTPS 证书有效。公网 HTTP 不满足剪贴板接口的安全上下文要求，复制按钮可能无法工作。
- 首页及品牌、山水、吉祥物、POP 徽章正常加载。
- 中文与英文切换、手机菜单、导航滚动正常。
- 合约复制完整，DeBox、Telegram、QQ群 `1097270072` 等入口保持正确。
- 托底金库显示真实 POP 数量、参考单价及美元估值。
- 托底参考价按项目指定的储备美元价值 / 3000 万枚展示；不等于保本承诺。
- 近 48 小时归集显示 POP 及美元参考值。首次历史扫描可能需要约一分钟，失败应显示暂未获取并可重试，不应变成零。
- 累计黑洞销毁数量读取喜羊羊在 dead 地址的实际余额，不冒充已执行回购或 `totalSupply` 减少；口径说明见页面 FAQ。
- 未确认的实际回购、回购销毁与 5% 自动执行逻辑继续待接入；不要在上线时填入宣传数字冒充链上数据。
- 已删除托底兑换操作区和“项目发行方案”四条说明，不要从旧效果图恢复它们。
- 浏览器开发者工具没有资源 404、CORS 或 CSP 拦截；在实际用户所在地区测试外部节点和报价访问。

更新网站时，完整上传新产物，避免只更新 `index.html` 或只更新部分脚本。建议 `index.html` 不长期缓存；使用带哈希文件名的 `/assets/` 文件可以长期缓存。上传与缓存刷新全部完成前，不要删除仍被旧 HTML 引用的哈希资源。

## 官方参考

- [Vite 静态部署](https://vite.dev/guide/static-deploy)
- [Vite 环境变量与构建模式](https://vite.dev/guide/env-and-mode)
