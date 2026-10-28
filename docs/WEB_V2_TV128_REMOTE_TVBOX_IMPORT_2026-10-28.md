# 2026-10-28 / TV128：TVBox 远程订阅导入与浏览器 CORS 实测

## 项目与方向

仓库 wpuu/joyflix；开发分支 feature/web-v2-migration-20261027；旧 JoyFlix main、生产别名以及 wpuu/TV 的新版 Web 备份不修改。

用户目标是免费影视网站，随后接入弹幕和 Agnes 3.0 Flash 审核。原有对两部授权完整电影的搜索→详情→首帧→第60秒跳播已在 TV126 完成真实美国 Chrome 验收，TV127 加入 TVBox/CMS 文本粘贴适配。这轮只解决「大量真实 TVBox 配置以 URL 订阅形式出现，而 Web 实验室只能粘贴原始文本」的缺口。

**核心原则：不将解析到的未知影视源自动加入公共 SourceHub，不访问配置里列出的任意第三方服务器、不执行 TVBox Spider/JAR/JS/Python，不绕过 DRM/CORS、防盗链或站点付费鉴权。来源可被分类不等于影片可播放，更不等于有传播许可。**

## 一、真实公开单仓的数据审计（只读，不抓取视频）

公开参考：[TVboxorg/TVbox](https://github.com/TVboxorg/TVbox)，固定提交 0bb8a8061b41dd79276a601830f854792f5e348a 的 dist/official.json。此文件为第三方聚合目录，来源的版权及商用权利未经验证，因此**只用于解析与统计，不用于影视播放或站点生产数据源**。

| 类型 | 个数 |
| --- | ---: |
| 配置中的 sites 总数 | 160 |
| type=3 Spider 等原生插件类型 | 142 |
| type=1 JSON HTTP | 18 |
| 按本项目保守规则可手动尝试 JSON HTTP 的站点 | 15 |

以上为 2026-10-28 固定配置快照的统计，不代表 15 个可播放，更不代表有 15 个可以合法商业传播的片源。

真实技术取舍：这份案例中约89%的站点为 Spider，不能只把 TVBox JSON 导入 Web 就宣称获得 TVBox 的完整能力。那些要由未来 GPL 合规的 FongMi Android 原生客户端另做兼容性判断。Web V2 优先支持无需特殊请求头、额外脚本和解析器的公开 HTTPS JSON HTTP CMS 接口。

## 二、GitHub 实际工程变更

功能已写入 JoyFlix 私有迁移工作分支（JoyFlix 仓库本身公开，独立 SSO Preview 用于测试）。

- src/lib/webv2/source-config-lab.ts：非执行式 JSONC 处理器。允许 JSON 标准对象、// 注释、/*...*/注释及尾随逗号；不执行 JavaScript，不接受未引用的脚本表达式。保留 https:// 字符串不破坏。最多扫描300个站点（先前仅扫描120个，会遗漏部分真实订阅源）。明确识别并拒绝顶层 urls 的多仓配置，而非自动递归拉取。
- 同一核心文件：新增 probeRemoteConfig 与 inspectRemoteConfigUrl。仅接受不带 URL 查询参数、用户名、密码、端口、锚点、IP字面量或本地域名的标准 HTTPS URL；只在用户点击后从浏览器发送一个 GET，mode=cors、credentials=omit、redirect=error、referrerPolicy=no-referrer、cache=no-store，10秒超时、最多128KB响应。限制Content-Type；遇到过大/HTML/重定向/网络/CORS错误时返回脱敏类别。
- src/components/webv2/source-config-lab.tsx：用户输入远程单仓 URL、手动读取、在浏览器本地显示分组统计、默认只显示可手动测试的 JSON HTTP，仍可以展开全部站点。读取结束清除远程 URL，不缓存、不上传、不写 localStorage。
- tests/webv2.remote-config.test.mjs：新增7项测试，覆盖真实配置的 JSONC、160站点完整扫描、多仓拒绝、含令牌URL拒绝、浏览器请求安全参数、响应限额/CORS失败以及UI确认行为。
- .github/workflows/web-v2-migration-ci.yml 更新，覆盖上述测试。失败过的早期测试/构建记录不被省略，后续更正后再要求完整CI通过。
- scripts/web-v2-real-tvbox-browser.mjs 和对应 GitHub Actions：从真实外部 GitHub Raw 的固定真实TVBox配置URL读取文件，测试对象是订阅配置本身；**不主动查询任何被列出的 CMS 或 Spider，也不下载任何视频**。
- 功能提交：774cc75（JSONC和300条扫描）→56f4ce2（浏览器远程单仓获取）→003f77c（UI导入）→bda712f（纯TS模块合并）→e5de949（回归测试）→2472e68（CI接入）→370c1ed（修复TypeScript重名）→2b65dd4（实际真实TVBox CORS 浏览器证明）。

## 三、独立验收结果

| 验收 | 精确结果 |
| --- | --- |
| [GitHub Actions #40677180213](https://github.com/wpuu/joyflix/actions/runs/40677180213) | 对功能代码 SHA 370c1ed：50/50合同测试通过、Next.js14完整构建成功、两部授权视频样本HTTP链路成功 |
| [GitHub Actions #40677180353](https://github.com/wpuu/joyflix/actions/runs/40677180353) | 对 SHA 370c1ed：真实 Chrome 仍能播放两部授权原片（2/2），并继续完成模拟CMS→真实影片首帧、跳播（1/1） |
| [GitHub Actions #40677425532](https://github.com/wpuu/joyflix/actions/runs/40677425532) | 对最终功能SHA 2b65dd4：真实美国 GitHub Chrome 使用锁定的真实TVBox config URL成功读取（CORS），识别160个站点，筛选15个候选JSON HTTP；导入中对第三方影视站点的请求数量为0、视频请求数量为0；终止后URL输入框已清空；日志 WEB_V2_PINNED_REAL_TVBOX_CORS_IMPORT=PASS |
| [Vercel Preview dpl_6k5rnHZP6Y37vVsaDxaVh1syx8hD](https://vercel.com/rerisse7-1717s-projects/joyflix-web-v2-preview/6k5rnHZP6Y37vVsaDxaVh1syx8hD) | SHA 2b65dd4，READY，target=null 非Production，受保护项目 joyflix-web-v2-preview，SSO enabled=true、deploymentType=all |
| 生产安全 | 旧 wpujoyflix.vercel.app 仍指向旧部署 dpl_FeD6QjKhiPruz8pJFgaT4YCdYZpk；joyflix main SHA 3b1c02d、TV旧开发分支 SHA 996807f 均未改变 |

上一轮测试过程中一度发现合并纯TS模块产生的 TypeScript Transport 类型重名，导致早期 Actions #40676980641 / #40676980593 与 #40677081307 的编译失败。后续提交 370c1ed 已修复，主CI与原片Chrome均恢复成功；不得隐瞒失败历史。

## 四、当前在线入口与实际操作

- 远程单仓 URL 导入入口（受 Vercel Authentication 保护）：https://joyflix-web-v2-preview-n3x0qzb4x-rerisse7-1717s-projects.vercel.app/v2/qa/source-lab
- Web V2 搜索首页：https://joyflix-web-v2-preview-n3x0qzb4x-rerisse7-1717s-projects.vercel.app/v2

用户可以在远程单仓输入框粘贴自己有权使用的 TVBox JSON 订阅地址，然后点「手动读取远程 TVBox 配置」，默认只看可手动测试的 JSON HTTP 来源；对符合要求的来源再手动点击 CMS 搜索和选集测试。

如读取失败，首先区分 CORS_OR_NETWORK、INVALID_CONTENT_TYPE、TOO_LARGE、MULTI_REPO_NOT_SUPPORTED、QUERY_NOT_ALLOWED 等状态。不能改为 no-cors 读匿名响应，也不能通过任意服务端代理伪造浏览器能直接访问的能力。

用户没有提交真实要经营的片源、许可信息，也没有做中国大陆手机端浏览器的实际网络与10分钟续播验证。真实 TVBox 配置导入成功只能证明订阅格式与CORS有效，不能宣称免费热门电影、电视剧已经接入或商业合法。

## 五、下一阶段真正的决策节点

先取得一份用户有权使用、实际想接入的 CMS JSON 或 TVBox 单仓配置，在浏览器实测 1–3部具体作品的「搜索→详情→分集→首帧→10分钟持续播放→跳播」，并记录移动设备和用户网络的实际表现。如果只有 Spider/原生插件型来源，则不在 Web 上盲目破解或模拟该插件；根据原生客户端的 GPL-3.0要求另行评估 FongMi Android 的独立适配，旧TV仓库仍不提前覆盖。

只有有持久可用且授权明确的真实节目后，再优先处理弹幕的作品ID/分集/剪辑时间轴，以及 Agnes 3.0 Flash 的规则初审、语义审核与举报处理；不靠延长测试演示片数量替代商业片源供给。

TV128完成
