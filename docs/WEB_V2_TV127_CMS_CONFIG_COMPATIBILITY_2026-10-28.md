# 2026-10-28 / TV127：TVBox 与 CMS 兼容性实验室交付

## 方向与范围

项目：wpuu/joyflix；唯一开发分支 feature/web-v2-migration-20261027。

用户目标是免费影视 Web 网站，先解决真实片源兼容性，再做弹幕和 Agnes 3.0 Flash 审核；未来由 wpuu/TV 改造 Android FongMi 客户端。本轮只实现前述网站里的个人片源实验室，不改旧站 Production、支付、广告及 Android。

## 一、技术格式依据

- [FongMi 官方配置字典](https://fongmi.github.io/TV/config/)：sites 中 type=0 XML HTTP、type=1 JSON HTTP、type=3 Spider、type=4 扩展 HTTP。配置可能包含 ext、jar、click、playUrl、header，不能直接搬到 Web 执行。
- [MacCMS V10 Provide API](https://www.maccms.club/docs/integrations/provide)：JSON 查询通常使用 ac=videolist&wd=关键词，读取详情用 ac=detail&ids=视频ID，返回的 list 记录含 vod_id、vod_name、vod_play_from、vod_play_url。线路按 $$$，分集按 #，集名和视频地址按 $ 分隔。

兼容策略：只允许指定受保护的个人片源实验室分析 TVBox JSON，不执行未知脚本。支持用户主动直连标准 HTTPS JSON CMS，但不自动信任原站内容权利。

| 来源类型 | 当前处理 |
|---|---|
| type=1 JSON HTTP | 可手动发起浏览器直接 CMS 查询，若无额外脚本、特殊头、解析器且 HTTPS 合规 |
| type=0 XML HTTP | 仅识别，尚不支持读取 XML |
| type=3 Spider / JS / PY / JAR | 明确拒绝执行 |
| type=4 扩展 HTTP | 仅识别，需要单独适配 |
| 需要特殊 header、ext、jar、playUrl、click 的来源 | 不自动声明网页兼容 |
| 非 HTTPS、内网、IP、端口、用户名密码或无效媒体格式 | 拒绝或标记不兼容 |

## 二、已提交代码

- src/lib/webv2/source-config-lab.ts：TVBox JSON 纯数据分类，128KB配置上限，最多报告120个来源；CMS HTTP 请求合约、9秒超时、450KB响应上限、CORS/网络异常分类、影片和分集解析；不使用 eval 或远端 JS。
- src/components/webv2/source-config-lab.tsx：TVBox 配置粘贴、类型识别、JSON HTTP 选择、CMS 手动搜索/详情、有效分集手动播放按钮、可复制但不含来源 URL 的摘要。
- src/components/webv2/source-lab-client.tsx：选择 CMS 分集后交给原有 HLS.js/HTML5 视频播放器，由用户点击才发起媒体连接。播放地址不写入公开 SourceHub 注册表、数据库、localStorage、浏览器历史。
- tests/webv2.source-config.test.mjs：新增7项分类/网络安全/缓存/解析/CORS行为测试。
- scripts/web-v2-open-film-browser.mjs：在真实 Next.js + Chrome 上操作配置和CMS实验室，并调用真实开放电影媒体进行首帧和跳播检验。
- 其他改动仅是两个隔离 CI 工作流；旧 JoyFlix 的默认网站接口保持不变。

实际代码提交：
- [d22f54e：兼容性纯逻辑](https://github.com/wpuu/joyflix/commit/d22f54e963e8033c94b589529c99231018ab4824)
- [b098533：实验室 UI](https://github.com/wpuu/joyflix/commit/b0985334c9d165e30a25bbd013dd349b5a1bf5fc)
- [da5c72e：播放器集成及合同测试](https://github.com/wpuu/joyflix/commit/da5c72e1efb9932bd932c0d454a06facadfd86e7)
- [a856bee：真实 Chrome 操作回归](https://github.com/wpuu/joyflix/commit/a856bee4baa37200f2f4c4aa88857bebd0d90a45)

## 三、真实验收状态与证据

- [Actions #40673746037](https://github.com/wpuu/joyflix/actions/runs/40673746037)：completed/success，43/43 契约测试、Next.js14 全量构建、原网站 HTTP 验收及已授权视频样本兼容均通过。功能集成 SHA da5c72e。
- [Actions #40673950433](https://github.com/wpuu/joyflix/actions/runs/40673950433)：completed/success；日志记录 TVBOX_BROWSER_CMS_TO_REAL_FILM_PASS=1/1 与 WEB_V2_OPEN_FILMS_REAL_NEXT_CHROME_PASS=2/2。真实 Chrome 完成 TVBox JSON 配置分析、标记 Spider 不可运行、CMS 查询、分集选择，播放真实 CC BY 电影 Spring 超过两秒并跳到第60秒续播。
- **关键范围限定**：Chrome 测试里的 CMS JSON 是测试中拦截并模拟的接口响应，没有真实连接某个未知的第三方 CMS 服务；视频播放字节来自真实的、许可明确的 Blender 作品。该结果不能证明任何未知 CMS URL 在网页允许跨域、具有商业传播权或播放稳定。
- [Vercel dpl_4hh1WcMruqxdgSsipgzWQNJWpXgd](https://vercel.com/rerisse7-1717s-projects/joyflix-web-v2-preview/4hh1WcMruqxdgSsipgzWQNJWpXgd)：代码 SHA a856bee4baa37200f2f4c4aa88857bebd0d90a45；READY，target=null（Preview），独立项目 joyflix-web-v2-preview，SSO Vercel Authentication 仍 enabled=true / deploymentType=all。
- 原 JoyFlix 正式域名 wpujoyflix.vercel.app 仍指向旧 dpl_FeD6QjKhiPruz8pJFgaT4YCdYZpk；main 未修改。TV 原私有 Web 分支未修改。

## 四、现阶段用户实际测试流程

受保护的入口：
https://joyflix-web-v2-preview-kdfie1crc-rerisse7-1717s-projects.vercel.app/v2/qa/source-lab

1. 粘贴持有访问使用权限的 TVBox/FongMi JSON 配置完整文本到站点配置文本框，点击「本地识别配置」。
2. 选择不依赖 Spider/特殊头/扩展解析器的 type=1 JSON HTTP 来源；或直接输入标准 HTTPS CMS JSON API URL。
3. 输入一部真实作品名称，手动执行浏览器直连查询。结果失败时会展示如 CORS_OR_NETWORK、INVALID_JSON 等明确类别，而非尝试绕过站点限制。
4. 点击「读取此作品详情」或直接点击存在的 HLS、MP4、WebM 分集，按播放器的播放键和跳播按钮检查真实情况。
5. 复制脱敏兼容性摘要及媒体播放诊断。不要公开具有访问 Token 的视频 URL 或个人账号 Cookie。

该实验室只是客户端短期检查工具，不是自动采集器、全网版权许可或可商用 CDN。第三方服务器仍可能记录访问者 IP 和输入的搜索关键词。

## 五、放行与下一阶段

- **仍缺**用户真正准备接入的网站有权使用的免费无广告片源样本；目前无法证明任何未提供的 TVBox 配置或 CMS 外部 API 真正可用。
- 某来源浏览器跨域失败时，只能报告限制或讨论经过授权的来源服务方案；不可使用任意视频代理伪造 Referer、绕过 DRM 或收费限制。
- 对真实来源，按搜索、详情、分集、首帧、持续10分钟、跳播及手机网络表现逐项审核，且另外核验版权使用许可。通过后才进入受控 SourceHub 来源登记。
- 有可持续内容供应后，按作品ID/分集/版本时间轴开发弹幕，并用 Agnes 3.0 Flash 配合即时规则、AI复审、举报人工兜底。
- Web 未完成公开发布门槛以前，不合并 JoyFlix main，不覆盖旧域名，不改造 TV 原开发主线为正式 Android 客户端。

最终状态：**新片源兼容性实验室已提交并在受保护 Preview READY；本地模拟CMS→真实授权视频的 Chrome链路通过；未知实际第三方CMS来源仍待独立实测。**

TV127完成
