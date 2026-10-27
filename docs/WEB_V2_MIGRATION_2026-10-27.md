# 2026-10-27 / TV123：Web + Android 双仓迁移进展

本轮是实际工程准备，不是将无授权影视源公开上架的许可。

## 安全快照与工作分支
- wpuu/joyflix 的旧 main 固定为 3b1c02dd1e50022b8f7dbb3233b85eaf06bd7456。
- 原站备份：wpuu/joyflix 的 backup/pre-web-v2-20261027。
- wpuu/TV 的新版 Web 冻结在 996807f933466edda24e150ecd4fa084c6ab776c。
- TV Web 私有备份：wpuu/TV 的 backup/tv-web-20261027。
- 当前唯一工作分支：wpuu/joyflix 的 feature/web-v2-migration-20261027。
- JoyFlix 生产域名、Vercel 项目与生产 SHA 不应改变。TV 私有仓库目前未公开拷贝到 JoyFlix。

## 本轮实际工程
在旧站迁移分支新增独立 SourceHub 纯协议和规范化内核。
- src/lib/sourcehub/core.ts：统一 CMS JSON 的搜索结果、线路、分集和媒体格式。
- 每个来源必须有明确的内容版权方、证据地址、精确的获许可作品ID、有效期和媒体域名白名单。
- 无批准来源默认拒绝；APPROVED_SOURCES 初始化为空。
- 不接受直接运行 TVBox/JAR/QuickJS 插件，不执行远端网络请求，也不代理任意视频、破解 DRM 或跳过 CORS。
- src/lib/sourcehub 不依赖旧 wpujoyflix.vercel.app 的 API；它仅完成纯数据规范化，尚未接入网页真实路由。
- tests/sourcehub.core.test.mjs 与隔离 GitHub Actions 工作流执行输入边界、审批准入和CMS解析的真实回归。
- 不接入未经明确许可的商业影片，不触碰旧站正式接口或用户账号。

## 为什么此时还不能复制 TV 全部文件
TV 新版代码 Next.js16 + React19，旧 JoyFlix 是 Next.js14 + React18，同时 TV 的 next.config.ts 和 provider-mode.ts 只允许指定 Preview 项目。直接覆盖不仅会丢失旧接口，还会使生产构建被防误部署门禁拦截。
JoyFlix 仓库是公开的，TV 是私有的：逐文件迁入前要检查素材与许可证，避免意外公开密钥或受限制的内容。旧 JoyFlix 的 LICENSE 为 CC BY-NC-SA 4.0，不得自动假设旧代码可用于任何商业部署。

## 接下来实际推进的验收关口
1. 纯 SourceHub CI 必须先成功；失败时只修 SourceHub 不影响旧站。
2. 取得至少一个有明确网站播放使用权的多部作品数据源，完成 CMS 搜索、详情和真实 HLS/MP4 的浏览器播放。没有授权不能用未知网站或旧站代充测试结果。
3. 在 JoyFlix 迁移分支移植经过权利审查的 TV Web 独立 UI 与对应 tests；替换 TV 个人模式硬编码旧站 API，建立真正由 SourceHub 驱动的路由。
4. Web V2 验收通过并可回滚后，才在 wpuu/TV 独立 Android 候选分支试编译 FongMi/TV，评估 GPL-3.0 分发要求；TVBoxOS AGPL-3.0 不混入闭源后端。
5. 未来弹幕和 Agnes 审核分为独立服务层，先有合规使用和用户内容保护验证再公开上线。

阶段状态：P0 备份已完成；P1 独立 SourceHub 协议提交；整站迁移、真实多片源验证和安卓 APK 均尚未完成。


## 2026-10-27 / 第二批：迁移分支已接入独立 API，但尚未替换旧 Web

- 新增只读 src/app/api/v2/sourcehub/search 和 src/app/api/v2/sourcehub/detail API。
- 使用 SourceHub 统一编排，通过精确已批准的源与作品白名单，限定请求为 HTTPS、JSON、最多512KB，禁止重定向，单请求超时4.5秒。
- 没有准入来源时 HTTP 503 明确返回 sourcehub_no_approved_sources，不会偷偷降级到旧 JoyFlix 接口或任何 TVBox Spider。
- 搜索只返回作品和线路数量，不向普通搜索客户端暴露带 token 的媒体 URL；具体播放线路需在已批准的详情请求中读取。
- 当前真正接通的是 SourceHub 受控 API 的数据路径和假上游回归；APPROVED_SOURCES 仍为空。仍未对接外部真实 CMS，也未移植 TV 私有整站前端。
- 在未完成 DNS/出口白名单、网络重绑定防护前，不允许加入实时生产上游。


## 2026-10-27 / 第三批：真实复用 TV 自有播放器纯逻辑
- 从私有 TV 已封存提交 996807f 中只读检查并选择两份纯 TS 逻辑：playback-health.ts（移动端缓冲误判、真实时间推进、超时判断），hls-playback-policy.ts（HLS 引擎决策、匿名错误分类）。
- 将这两份明确无 API 凭据、媒体 URL 和第三方影视数据的源文件移植到公开 JoyFlix 迁移分支的 src/lib/webv2/player/ 下。保留代码功能，未接到生产播放器，不复制第三方海报/片源或整个私有仓库。
- 新增独立跨仓库回归 tests/webv2.playback.test.mjs，覆盖移动端 MSE 和 Safari 的HLS引擎选择、首帧缓冲、跳播伪进度、防错误泄露。
- 此次仅移植纯逻辑，不表示已经将新 TV 的所有 UI/播放器组装到旧站。完整转移需 Next16 对比与安全/素材核准。
