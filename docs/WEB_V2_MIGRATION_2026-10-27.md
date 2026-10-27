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

## 2026-10-27 / CI验收及在线预览审计

- 最新业务提交 5fe1c720f629892ae9a6821a39a066f0003725a6。
- 独立 GitHub Actions #40533175319：https://github.com/wpuu/joyflix/actions/runs/40533175319，completed/success。
- 契约测试：19/19通过；旧 Next.js14 整站构建成功；真实回环 HTTP 服务对 /api/v2/sourcehub/search 无已核准源拒绝503，对详情无效来源拒绝400；日志含 WEB_V2_SOURCEHUB_ROUTE_FAIL_CLOSED_PASS。
- 这只证明 GitHub Runner 本地应用构建、接口和已迁移两份播放纯逻辑正确，不证明新版 TV 界面已迁入或任何第三方影片已播放成功。
- 新建的 Vercel JoyFlix 迁移分支 Preview dpl_9ic24L5S3EyqK3EimSU5CYWp7pYJ 状态 ERROR。已回读的构建事件包括 Vercel CLI65.1.0、pnpm-lock9、Installing dependencies...，唯一明确错误文本为 “The build reported a problem and the deployment can not continue. Exiting now.”。相同错误在本次迁移分支的更早提交也出现，目前没有取得可据此确认根因的详细构建栈。不得把 GitHub CI 成功写成 Vercel Preview READY，也不应盲目更改生产项目配置或无限重试。
- 生产别名 wpujoyflix.vercel.app 已读回仍映射旧 READY deployment dpl_FeD6QjKhiPruz8pJFgaT4YCdYZpk / 源码 3b1c02d；旧 main 未改变。
- TV 私有代码跨仓库自动审计 #40532699164：https://github.com/wpuu/TV/actions/runs/40532699164；扫描210文本、4二进制素材待许可证审核、未发现预设密钥特征；旧上游主机、个人后端与豆瓣素材依赖仍在源树中。不能以此审计直接批准全私有文件公开。
- 私有审计交接：https://github.com/wpuu/TV/blob/audit/web-to-joyflix-20261027/docs/WEB_EXPORT_AUDIT_2026-10-27.md。

下一次优先任务：保留生产独立的前提下定位 JoyFlix 分支 Preview 构建日志缺口；逐文件完成新版 TV 页面及原始素材的来源审查；按独立 Next.js16 体系移植 Web V2 并将已有 SourceHub API 接入新版搜索/详情。无授权来源前禁止宣称影视片源已解决。Android FongMi 工作继续在 Web 迁移可验收之后启动。

## 2026-10-28 / 第124轮：隔离 Preview 项目与真实构建门禁

- Vercel 中建立单独项目 `joyflix-web-v2-preview`，Project ID `prj_Rsb44MGU9x6aEd6IqgR4A4MawFrX`，SSO保护 all，**创建时没有绑定自定义域名、没有关联Git仓库，也未自动部署**；后续首次手动Git部署却被Vercel标记为production并返回ERROR，参见下方审计。
- 原 `joyflix` Vercel 项目 ID `prj_EUzmQpHGHpDZy6VDHZ2ao8LInC10` 中，旧 main 与本迁移分支均出现了早期 Vercel CLI 中止错误，不能认定由 SourceHub 引起；日志仅有泛化错误及依赖安装开始，根因仍待定。
- 在迁移分支的 `next.config.js` 加入新 Web V2 Preview-only 门禁：只有指定项目、分支、`VERCEL_ENV=preview` 与 `VERCEL_TARGET_ENV=preview` 同时成立才能编译迁移分支；原旧项目即使自动创建本分支 Preview，也必须失败。
- GitHub CI 增加模拟老项目 Preview 拒绝、错误 production 目标拒绝、正确隔离 Preview 允许三种真实 next.config 加载断言；默认本地构建仍适用。
- 不修改原生产分支、旧Vercel项目环境和域名，不公开 TV 私有全量源码；进一步部署需要在新项目核实仅 Preview 和正确 SHA。

## 2026-10-28 / 第124轮：可打开的 Web V2 首页与播放页骨架

- 新增 `/v2` 页面：采用 TV Web 的移动优先视觉方向，提供实际 SourceHub 搜索输入与结果卡片，不走旧 JoyFlix 的推荐、片库和 CMS 接口。来源尚未批准时明确展示空状态，而非假数据。
- 新增 `/v2/watch?source=...&id=...`：真实调用 V2 的 SourceHub 详情路由，显示线路、选集，并在用户点击后加载视频。
- 视频部分直接使用迁来的 TV 播放引擎策略与真实前进时间检查；浏览器负责 HLS/MP4/WebM 解码，主动失败时只展示脱敏类别，不提供任意代理。
- 路由位于旧 JoyFlix 项目迁移分支中，与旧 `/` 首页和 `/play` 播放页隔离，不会改旧站生产行为。V2 页面暂不配置任何在线片源，因此当前主要验收的是页面加载、接口联通及无片源拒绝，不是热门影视成功首帧。
- GitHub 构建任务应验证两个新页面返回200；受保护独立Vercel Preview未成功前不得提供其网址为已可用。

## 2026-10-28 / SourceHub 作品身份与弹幕时间轴准备

- 不把同片名同年份当作同一作品：若跨来源缺少人工核验的 `canonicalWorkIds` 映射，不允许把弹幕错误合并。
- 新增 `canonicalIdForWork` 和 `groupSourcehubFilms`，仅对显式核验的 Wikidata QID / 自有作品 ID 合并；同作品不同年份版本仍单独处理。
- 搜索 API 返回归组后的真实来源和线路数量，V2 搜索页显示来源数；不传出搜索阶段的播放 URL。
- 真正的弹幕时间轴仍需 `canonicalId + season/episode + edition/version + offset`，尚未开放用户评论和 AI 审核。
- 新建的单独 SSO Vercel 测试项目仍存在失败的首次记录：`dpl_H3aGaLFoS8wDEgBfB41SwandzavV` 自动标记 `production` 但运行返回 ERROR，项目 `live=false`；没有向旧 JoyFlix 正式域名发布。**不继续尝试未经证实的 Vercel 自动目标。**
- [GitHub CI 40540740371](https://github.com/wpuu/joyflix/actions/runs/40540740371)：23/23、旧 Next.js 构建与 /v2 页面 HTTP 回路通过。
- [pnpm 安装兼容 CI 40541120674](https://github.com/wpuu/joyflix/actions/runs/40541120674)：`pnpm@10.14.0` 在干净 Node24 runner 上执行带生命周期脚本的 `pnpm install --frozen-lockfile` 成功，说明 Vercel 泛化错误**不能仅归因于锁文件或生命周期脚本**。目前仍缺平台实际根因。


## 2026-10-28 / 第124轮：本轮最新交付验收

### 源码与CI

- Web V2 新增独立搜索页 /v2 和播放页 /v2/watch，采用 TV 移动端视觉风格并从新版 SourceHub API 读取影片、线路与选集；只有点击按钮后才请求视频，不改旧网站的首页、搜索与播放路由。
- 正式上线源仍为空。CMS 来源须先确认具体作品的合法传播范围，再可加入白名单。不能把源格式正确、影片名字存在或旧站API可访问视为源已通过。
- 新增跨源作品映射 canonicalWorkIds 和 groupSourcehubFilms。未人工核对的同名作品不可自动合并；同一作品不同发行年份的 group.id 加入年份后缀。弹幕还需独立的分集、剪辑版本和时间偏移，尚未启动对外评论。
- 最新已通过的功能源码 SHA：db1620803ab943aadb7cad4ab8c34c72626f7be7。为了支持旧 JoyFlix 的 TS ES5 编译目标，已把 Map.values() 的展开迭代替换为 Array.from()。
- [GitHub CI #40542447724](https://github.com/wpuu/joyflix/actions/runs/40542447724)：completed/success，27/27测试通过。包括 Next.js14 构建、Preview环境门禁、真实HTTP页面、SourceHub无授权拒绝及视频URL不泄漏的回归。
- 保留此前失败证据：[CI #40541966770](https://github.com/wpuu/joyflix/actions/runs/40541966770) 旧断言未更新；[CI #40542153448](https://github.com/wpuu/joyflix/actions/runs/40542153448) ES5 Map迭代编译错误；二者均已定向修复，不能冒称失败提交通过。
- [pnpm安装对照 CI #40541120674](https://github.com/wpuu/joyflix/actions/runs/40541120674)：全新 Node24 上 pnpm10.14.0 的完整 frozen-lockfile 安装成功，因此不能把 Vercel 的泛化中止直接判为依赖锁文件损坏。
- [私有 TV导出审计 #40532699164](https://github.com/wpuu/TV/actions/runs/40532699164)：已扫描代码的常见凭据特征未命中；仍有四项二进制素材需要许可审查，不代表全量私有源码可公开复制。

### Vercel真实状态

- 原 JoyFlix 生产项目 ID prj_EUzmQpHGHpDZy6VDHZ2ao8LInC10，正式域名 wpujoyflix.vercel.app 仍指向旧 READY 部署 dpl_FeD6QjKhiPruz8pJFgaT4YCdYZpk；JoyFlix main 原SHA未改变。
- 新隔离项目 joyflix-web-v2-preview，ID prj_Rsb44MGU9x6aEd6IqgR4A4MawFrX，Vercel Authentication为all，无公开自定义域名。一笔首次 Git 部署 dpl_H3aGaLFoS8wDEgBfB41SwandzavV 意外被返回 target=production，但状态ERROR且项目live=false，**不属于可用的 Preview 或实际生产上线**。
- 新构建门禁拒绝错误项目或 production 环境，不得关闭门禁或关闭SSO。由于旧项目和新项目的 JoyFlix Git 构建均在依赖安装阶段附近遇到同一泛化错误，而 GitHub 安装和构建可通过，Vercel根因仍是未证实的环境/集成阻塞；先停用无效重复尝试。

### 验收关口

| 阶段 | 结论 |
| --- | --- |
| P0 双仓库恢复基线与迁移分支 | PASS |
| P1 SourceHub CMS规范化、授权拒绝与HTTP接口 | PASS（不含真实片源） |
| P2 Web V2 搜索与播放器页面 | PASS（CI +本地真实HTTP，尚无在线视频） |
| P2 Vercel在线 Preview | BLOCKED（不能宣称READY） |
| P3 弹幕及Agnes自动审核 | NOT STARTED |
| P4 FongMi Android改造 | NOT STARTED，待Web V2门槛通过 |
| P5 商业上线 | BLOCKED：片源权利、合规、用户验收和广告盈利仍未知 |

下一轮应优先解决安全的Vercel Preview发布路径，并对用户后续提供的有使用许可的无广告 CMS/媒体源做可达性和合法播放验证。没有这两项证据前，不合并 JoyFlix main，不覆盖旧站，也不把空片库当成可用产品。
