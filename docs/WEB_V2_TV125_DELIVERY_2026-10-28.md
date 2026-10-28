# 2026-10-28 / TV125｜Web V2 独立 Preview 与片源实验室交付

项目目标：免费影视 Web 站优先验证实际播放来源，再考虑跨设备弹幕、Agnes 3.0 Flash 审核与 FongMi Android 客户端。本文仅记录已发生的工程结果，不将单条测试片或空来源宣称为完整可盈利影视站。

## 一、实际工程成果

1. 原 JoyFlix `main` 仍为 `3b1c02dd1e50022b8f7dbb3233b85eaf06bd7456`；既有 `wpujoyflix.vercel.app` 生产别名依旧映射 `dpl_FeD6QjKhiPruz8pJFgaT4YCdYZpk`。未修改生产域名、旧站或旧数据库。
2. 原 TV 新版 Web 仍在私有仓库 `wpuu/TV` 的 `feat/personal-online-preview-20261014`，SHA `996807f933466edda24e150ecd4fa084c6ab776c`；已有 `backup/tv-web-20261027` 备份。FongMi Android 尚未启动。
3. Web V2 主实施分支：`wpuu/joyflix:feature/web-v2-migration-20261027`。保留 `backup/pre-web-v2-20261027`，不往 `main` 合并。
4. Web V2 既有 /v2 搜索、/v2/watch 详情和 HLS/MP4/WebM 播放页面由独立 SourceHub 提供数据，不再强制调用旧站 API；跨片源归并必须有经过审核的共同作品ID；默认批准的内容源列表依然为空。
5. 新增 /v2/qa/source-lab **个人片源实验室**：支持用户手动粘贴 HTTPS 的 .m3u8/.mp4/.m4v/.webm 文件播放地址、真实媒体时间推进至少2秒、60秒跳播后的续播检测、浏览器/HLS 错误阶段分类，以及不含 URL 或密钥的诊断报告。粘贴的链接只保存在浏览器内存中，不保存数据库/本地历史，不经过本站视频代理。
6. SourceLab 仅允许该分支对应 Vercel 受保护 Preview 环境和本地开发环境运行；若环境缺失、Production、其他项目、其他分支均拒绝显示。网页不会绕过付费鉴权、DRM 或第三方媒体访问限制。测试可用性不意味着获得影视公开传播许可。

## 二、独立 Preview 首次误判已解决

旧问题：Vercel 新建项目的**第一笔**部署在未指定 production 的情况下被分类为 production 并以 ERROR 结束。类似事件公开记录在 <https://github.com/vercel/vercel/issues/17069>。本轮没有尝试删除失效的记录、关闭构建门禁或降低登录保护。

成功的发布过程：

- 隔离项目：`joyflix-web-v2-preview`，Project ID `prj_Rsb44MGU9x6aEd6IqgR4A4MawFrX`。
- 首笔失败部署：`dpl_H3aGaLFoS8wDEgBfB41SwandzavV`，target=production、ERROR、无可用应用。
- 第二笔同项目部署：`dpl_6LQA6ZuZTcWegQoqbrfPvXuSjTo8`，源码SHA `db1620803ab943aadb7cad4ab8c34c72626f7be7`，**target=null (Preview)、READY**，包含 /v2 和 /v2/watch。
- 最新版本：`dpl_33AsG6jhbhHJLoPZF3fMhC141sKA`，源码SHA `d974ef2bee10095226f6daf532e8b99492ccfe3d`，**target=null (Preview)、READY**，含 /v2/qa/source-lab 路由。构建日志显示 `Deployment completed`。
- 项目 `ssoProtection.enabled=true`、`deploymentType=all`，没有关闭 Vercel Authentication；项目 `live=false`。
- 个人测试入口：<https://joyflix-web-v2-preview-ke30c3nu9-rerisse7-1717s-projects.vercel.app/v2/qa/source-lab>
- 新版首页：<https://joyflix-web-v2-preview-ke30c3nu9-rerisse7-1717s-projects.vercel.app/v2>
- Vercel 详情：<https://vercel.com/rerisse7-1717s-projects/joyflix-web-v2-preview/33AsG6jhbhHJLoPZF3fMhC141sKA>

**验证边界：** Vercel READY、构建日志出现路由，只证明平台构建和部署成功；没有在用户浏览器凭证下进行在线登录后的点击、真实片源首帧或移动真机验收。为保留认证，不生成免登录分享链接。

## 三、测试与失败证据

- [GitHub Actions #40623036350](https://github.com/wpuu/joyflix/actions/runs/40623036350)：对源码 `d974ef2` 完成 **32/32** Node24合同测试，Next.js14整站编译，真实本地HTTP /v2 和 /v2/watch及SourceHub 503/400拒绝模式测试。构建产物明确包括 /v2/qa/source-lab。
- SourceLab 测试覆盖：HTTPS直链格式、禁止内部地址/端口/凭证形式的 URL、非测试环境404条件、复制报告脱敏、不在客户端自动执行服务端抓取或本地永久保存。
- 此处没有模拟“真实片源一定可播放”；缺少用户提供的合法视频地址，所以本轮没有实测第三方影视片段、分片或密钥的首帧。
- 之前 GitHub CI 的静态断言失败、TS ES5 Map 迭代失败均留档并在上一轮修复，不把失败版本当发布基线。
- 旧 JoyFlix Vercel 项目曾有依赖安装阶段的泛化 ERROR；本次以独立受保护项目成功完成真正的 Preview 部署，不再重复无效的旧项目发布尝试。

## 四、下一轮不再空转的验收顺序

1. **源测试：** 由用户在个人片源实验室填入其实际可合法使用的无广告媒体直链，真实播放超过2秒并测试跳播；复制脱敏诊断报告（不需要向聊天发送签名媒体 URL 或身份令牌）。
2. **CMS类型：** 对需要 `?ac=videolist` 的影视源，先单独提供不含令牌的接口类型和可公开的样本结构，确认内容权利、服务条款、跨域和播放资源，再给 SourceHub 配置有边界的可用 API。SourceLab 暂不支持 TVBox JSON/JAR/QuickJS配置直接解析，不可把这些 URL 当 .m3u8 直接播放。
3. **片源质量：** 做一个小样本的搜索→详情→选集→首帧→10分钟续播→换源验收，记录真机及中国网络测试结果。若都不可用，则明确停止继续开发空播放器。
4. **弹幕：** 有了真实可用作品后按 `canonicalId + season + episode + edition + timestamp` 建数据层，先做本地弹幕 overlay，再加 Agnes 风险规则、AI语义复审、举报与人工兜底。
5. **Android：** Web 来源与弹幕接口通过验收后，在原 TV 备份基础上建立 FongMi Android 独立工程；审计 GPL-3.0 与实际 SDK 的运行兼容性。
6. **商业化：** 未核实正版传播授权、用户数据管理和运营准入前，不切换公开生产站或启用广告/支付。

状态：**Web V2独立 Preview＝已成功部署；片源测试工具＝已提交并部署；真实商业影片＝未成功验收；弹幕／Agnes／FongMi＝下一阶段。**

完成标识：`TV125完成`
