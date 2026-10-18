# 喜羊羊 XIYANGYANG 官网

React + TypeScript + Vite + Tailwind CSS 构建的只读展示官网。适配电脑、平板和手机，提供中英文切换、锚点导航、复制反馈及链上查询入口。本地交付，未发布。

## 部署交付

完整源码包为 `release/xiyangyang-source.zip`；可直接上传的静态包为 `release/xiyangyang-static.zip`。部署步骤与上线检查见 [DEPLOYMENT.md](DEPLOYMENT.md)。当前静态包用于域名根目录，正式站点启用 HTTPS；配置变更需要重新构建。

## 启动

使用 Node.js 22.12+（本次验证环境为 Node.js 24）。

```sh
npm install
npm run dev
```

打开终端打印的本地 URL。本次运行于 http://localhost:5173/ 。默认端口被占用时，Vite 会选择可用端口。

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`dist/` 是生产构建；`npm run preview` 仅预览本地生产构建，不执行发布。

## 内容与配置

| 位置 | 用途 |
| --- | --- |
| `src/content/copy.ts` | 中英文文案 |
| `src/config/brand.ts` | 品牌素材与官方外部入口 |
| `src/config/chain.ts` | BSC、代币地址、可选金库与回购地址 |
| `src/config/contracts.ts` | 经核实的托底价接口、累计销毁及回购记录读取器 |
| `src/config/quotes.ts` | 经确认的 POP/USD 报价来源与解析器 |
| `src/config/blackhole.ts` | 已核实黑洞地址的代币身份校验与查询入口 |
| `src/config/valuation.ts` | 项目指定的 3000 万枚美元参考价展示口径 |
| `src/data/treasury.ts` | 只读 RPC、实际 decimals、余额读取、状态与请求去重 |
| `src/data/buybackFlows.ts` | 已核实金库到指定接收地址的滚动 48 小时 POP 归集记录 |
| `src/hooks/useTreasury.ts` | 30 秒轮询、手动重试及后台页面暂停 |
| `src/hooks/useBuybackFlows.ts` | 独立 60 秒增量刷新，不阻塞金库与报价 |
| `src/lib/format.ts` | bigint 数量、极小数与美元参考值格式化 |
| `src/components/` | 页面分区与展示组件 |
| `public/brand/` | 独立 Logo、透明角色、山水与 POP 标识 |
| `docs/screenshots/` | 实际浏览器截图与视觉对比 |

## 当前接入状态

已配置网络 BNB Smart Chain（Chain ID 56）、喜羊羊和 POP 代币地址、BscScan、Flap 交易入口、Telegram、DeBox、QQ群 `1097270072`、POP/Zypher 生态官方 X 和 Zypher 官网。DeBox 使用项目提供的完整链接 `https://m.debox.pro/group?id=eoaydsq4&code=zgvne98v`。

**已接入真实链上读取**：托底金库 `0x24969be5ce754c517e631805931916b826b4a4f7` 的实际 POP 余额，以及该金库 `currentPricePerTokenRaw()` 返回的每枚 XIYANGYANG 托底价（接口固定 18 位小数）。数量使用实际 ERC20 decimals；两项读数锁定同一 BSC 区块，并校验金库的代币及储备资产身份。

**美元参考估值**：使用已核对资产和工厂身份的 PancakeSwap V3 POP/USDT 池，经 DEX Screener 读取 POP/USD。金库显示 POP 数量、POP 单价及储备美元估值。按照项目最新指定口径，主托底参考价为 `金库 POP × POP/USD ÷ 30,000,000`，不是合约报价承诺；合约按当前阶段剩余数量计算的 POP getter 另列为补充。所有计算保留 bigint 精度，无有效报价时不展示美元数值。

**已接入近 48 小时回购资金归集**：金库指定接收地址为 `0x3de5f55d352b1e161392a3fcebac5c0072ffb274`。第三项统计本项目金库向该地址转入 POP 的数量、笔数和精确时间窗口，并按当前 POP 报价给出美元参考值。它不等于已执行回购、已销毁金额或专属可用余额；不会用钱包总余额替代。独立历史读取首轮约一分钟，之后仅扫描增量和重叠区间；失败显示“暂未获取”并可重试，不使用静态快照兜底。证据见 `docs/buyback-48h-verification.md`。

已核实交易池 `0xc06924c9234b39376ea80b21aea49ae692bc5bac`：代币 `mainPool()` 指向该池，池的 `token0/1()` 分别对应 XIYANGYANG 与 POP。累计回购销毁和最近回购仍待接入。金库的 `totalBurned()` 只记录托底路径销毁，不当作回购累计销毁。

**累计黑洞销毁数量**：按用户最新要求，机制区域只显示简洁累计值，直接读取 `XIYANGYANG.balanceOf(0x000000000000000000000000000000000000dEaD)`，使用实际代币精度并随主数据每 30 秒刷新；读取失败显示暂未获取，可重试，不以零或历史快照替代。它表示黑洞地址持有量，不代表已确认的回购投入，也不代表 `totalSupply` 已减少；口径说明保留在 FAQ，不再显示冗长交易列表。

本次完整历史核对至区块 `128366352`（北京时间 2026-10-18 20:58:45），确认 8 笔、合计 19,508 枚均来自用户托底路径，`totalSupply` 仍为 10 亿。指定回购接收地址的独立核查未找到可确认的实际回购执行，不据此认定其他未知钱包没有回购。历史报告见 `docs/onchain/burn-path-summary.md`、`docs/onchain/buyback-execution-investigation-128365767.md`，均不是页面实时数据源。

源码中的 3000 万枚为**每阶段托底数量**，不是已证实的终身累计上限。初始发行量 10 亿枚不当作当前流通量。5% 自动回购逻辑未在已核实金库代码中找到，执行条件继续标为未核实。1.5% / 0.5% 展示为项目名义分配口径，不宣称已经核实净到账比例。未展示未经证明的基金支持、孵化、审计或币安支持关系。

源码、重编译比对、链上关联及固定历史核实快照见 `docs/onchain-verification.md`。历史快照用于核实证据，不是页面的数据源。

## 接入真实数据

1. 默认使用 `src/config/verified.ts` 内已核实部署，直接运行即可读取真实储备与托底价。需要覆盖时，将 `.env.example` 复制为 `.env.local`。空地址仍使用已核实默认值；更改环境变量后重启服务器并重新构建。
2. `VITE_TREASURY_ADDRESS` 必须是实际持有 POP 储备的地址。使用 POP 合约的 `balanceOf` 读取余额，同时读取真实 `decimals` 和 `symbol`。
3. 默认回购地址及 POP 资产已配置，但余额读取受专属资金语义校验保护。仅在**确认属于本项目且确为可用资金**后，才设置 `VITE_BUYBACK_BALANCE_VERIFIED=true` 和有效 HTTPS 证据 `VITE_BUYBACK_BALANCE_EVIDENCE_URL`。不能仅因地址有 POP 余额就启用。覆盖时同时确认 `VITE_BUYBACK_ADDRESS`、资产类型及 ERC20 地址；原生 BNB 类型为 `native`。
4. 当前 `floorPrice` 已接入核实后的金库只读接口。若覆盖为其他金库，默认价格接口会自动停用，防止混用旧金库价格。核实新部署代码及单位后再配置真实 `address`、只读 `abi`、`functionName`、`args`（如有）、`outputDecimals` 和证据 `verificationUrl`。返回精度必须按接口语义确认；不可只因为 POP 是 18 位便推定所有价格接口都采用 18 位。
5. `cumulativeBurned` 使用相同的只读接口配置。最近回购通过 `recentBuyback.read({ client, blockNumber })` 接入经确认的事件或索引源，返回 `{ transactionHash, timestamp, amount: { raw, decimals, symbol } }`；`timestamp` 为毫秒。返回 `null` 仅代表已经查询的核实范围内没有记录。不要根据未确认的 dead 地址、事件名称或转账推算累计销毁和回购。
6. `src/config/quotes.ts` 已配置确认的 POP/USDT 池，只接受匹配的 BSC/PancakeSwap V3、POP/USDT 地址及至少 5 万美元的报告流动性。报价最长有效 60 秒。DEX Screener 不返回行情更新时间，因此明确显示“报价获取时间”，不冒称行情时间。过期、错误资产和异常报价不展示；无报价时保留 POP 原始数量。
7. 可选的交易池地址与销毁记录 URL 也必须核实后填写。缺失配置只展示“待补充”，不生成占位外链。

主美元参考价采用用户最新指定的固定 3000 万枚展示口径，与合约 getter 分开展示，不视为保本或兑换承诺。所有自定义 ABI 必须为已确认的只读 `view` / `pure` 接口，本项目没有钱包连接、签名或写入合约的代码。

`VITE_` 变量会进入浏览器代码，只能放公开配置，不能填写私钥或服务端密钥。RPC 需允许浏览器跨域请求；默认使用公开 BSC RPC，可替换为自己的公开读节点。

## 状态与刷新

- 未提供配置：`—` 与相应单位、`待接入`；无请求、无伪造更新时间。
- 已配置并加载：`读取中`。
- 成功读取：真实 bigint 数量及读取时间；只有实际余额为零才显示 `0`。
- 读取失败：`暂未获取`，保留重试按钮，不伪装为零。
- 金库与回购读取锁定同一 BSC 区块；配置的请求并行，重复刷新共享一个进行中的请求。
- 页面可见时每 30 秒刷新，后台不轮询。没有配置任何数据源时不发送无意义 RPC 请求。
- 48 小时归集每 60 秒独立更新；`VITE_BSC_HISTORY_RPC_URL` 需支持 `eth_getLogs` 和浏览器 CORS，默认 `https://rpc-bsc.48.club`。区块按时间戳查找、保留 20 个确认；分段失败不会提交部分累计值。
- 覆盖金库或回购接收地址后，原部署的归集读取自动停用并显示待接入，避免与新储备混合；新的资金流关系须重新核实后接入。
- 不包含托底兑换、支付数量、预计到账、兑换按钮或任何资金操作。

## 素材与视觉

原始 Logo 由用户提供；透明吉祥物和独立山水通过内置 ImageGen 根据该品牌和已选预览图制作。未将完整预览图作为网页背景。来源与提示词见 `public/brand/*-provenance.md`、`docs/assets.md`。英文字体 Manrope 自托管，中文优先使用系统苹方 / 微软雅黑 / Noto Sans SC。

视觉以已选山水预览为品牌依据，并按最新文字要求更新为左右 Hero、暖白/生态绿配色、三指标只读金库；参考图中较早的基金宣传与未核实数据不予沿用。实际检查见 `design-qa.md`。
