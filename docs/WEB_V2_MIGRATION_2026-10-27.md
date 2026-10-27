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
