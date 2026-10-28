# 2026-10-28 / TV126｜两部真实授权影片完整播放链路交付与验收

> 本轮强调可观察到的真实视频播放，不把合成测试、清单 HTTP 200 或未授权商业片库当作网站完成。目标仓库：`wpuu/joyflix`；唯一开发分支：`feature/web-v2-migration-20261027`。

## 一、产品方向与不变约束

- Web：以 JoyFlix 迁移分支作为最终 Web V2 工作区；`wpuu/TV` 仍保留私有新版 Web 和备份，待 Web 真正完成迁移后才转为 FongMi Android。
- 片源：独立 SourceHub，按照具体作品、许可、来源白名单筛选；不执行任意 Spider/JAR/QuickJS，不绕过 DRM、CORS、鉴权或第三方站点限制。
- 弹幕/Agnes 3.0 Flash：作为后续共用服务；当前无真实用户弹幕发布和 AI 审核上线。
- 本轮没有修改 `wpuu/joyflix main`、`wpuu/TV` 原开发分支、旧 Vercel 项目或生产域名。

## 二、版权样本及真实媒体证据

两部真实**完整短片**，并非生成的占位视频：

| 作品 | 版权原始来源 | 可核查的媒体文件页 | 本站展示署名 | Chrome 实测时长 |
|---|---|---|---|---|
| Spring / 春（2019） | [Blender 官方 CC BY 4.0](https://studio.blender.org/projects/spring/pages/about/) | [Wikimedia Commons 原片](https://commons.wikimedia.org/wiki/File:Spring_-_Blender_Open_Movie.webm) | © Blender Foundation \| cloud.blender.org/spring | 464 秒 |
| Big Buck Bunny / 大雄兔（2008） | [Blender 官方 CC BY 3.0](https://peach.blender.org/about/) | [Wikimedia Commons 原片](https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_alt.webm) | © copyright 2008, Blender Foundation / www.bigbuckbunny.org，保留整片片尾署名 | 597 秒 |

- 本轮仅使用 Commons 的确切 `.webm` 原片链接，避免旧 MP4 404 猜测；未经核验的第三方影视 API 没有接入。
- [限额字节 CI #40634744568](https://github.com/wpuu/joyflix/actions/runs/40634744568)：两部原片各一次 0–4095 字节 Range 请求，均 HTTP 206，`video/webm`，前四字节 EBML 匹配，结果 `2/2`。**该步骤没有下载整片，也不是首帧证明。**
- 官方 CC BY 许可允许符合署名条件的复制与再利用；然而 Wikimedia Commons 不能当作本项目稳定、持续、面向大量用户的商业 CDN。保护预览中人工触发的少量测试不代表内容分发服务协议已获正式商业安排。

## 三、实际代码交付

- 在现有 `src/lib/sourcehub/core.ts` 中加入**严格 Preview 限定**的两条开放影片记录，仅当项目 ID `prj_Rsb44MGU9x6aEd6IqgR4A4MawFrX`、`VERCEL_ENV=preview`、`VERCEL_TARGET_ENV=preview`、迁移分支精确匹配，或本地开发模式时，才允许提供影片样本；普通生产仍由 `APPROVED_SOURCES=[]` 拒绝全部未批准源。
- 通过 `/api/v2/sourcehub/featured` 获得两部真实片目，不含媒体URL；`/api/v2/sourcehub/search` 可按中英文片名搜索；`/api/v2/sourcehub/detail` 仅对匹配的 source+work 返回播放 URL、作品署名、许可和官方证据。错误 ID / 跨片源组合不自动回退。
- `/v2` 首页可以显示真实短片卡片，点击进入 `/v2/watch` 选择线路、分集，再点击加载视频；播放器仍是既有 HTML5/WebM/HLS.js，并非移动原生 FongMi。
- 影片详情在页面显著展示原作者、许可证、Commons 文件页及外部视频交付说明；视频不会在用户点击加载之前自动被请求。
- 一次性对照源码提交：
  - [接入两个开放影片和UI的提交 fd0bdc3](https://github.com/wpuu/joyflix/commit/fd0bdc3eb4888f768364d83d1897455c876055d1)
  - [修复 Next.js14 旧 TypeScript 可空性编译的提交 bcb580a](https://github.com/wpuu/joyflix/commit/bcb580a3309ec98ba0e484142ee9fa55fafb1a28)
  - [增加真实 Next + Chrome 浏览器实测的提交 6737442](https://github.com/wpuu/joyflix/commit/67374420dd7b2cce16a0653be5bb6da7991a0489)

## 四、独立验收证据链

| 级别 | CI/部署 | 精确结论 |
|---|---|---|
| 静态与程序合同 | [Actions #40635093187](https://github.com/wpuu/joyflix/actions/runs/40635093187) | `completed/success`，**36/36** 项；Next.js14 构建，模拟的受保护 Preview 实际 HTTP：featured 两片、搜索两片、详情附许可、无媒体 URL 公开于搜索清单、错误配对拒绝 |
| 浏览器真操作 + 真媒体 | [Actions #40635239483](https://github.com/wpuu/joyflix/actions/runs/40635239483) | `completed/success`，`WEB_V2_OPEN_FILMS_REAL_NEXT_CHROME_PASS=2/2`；真实 Chrome 打开 /v2，两个影片都能进入详情，点击前没有视频元素，加载后真实播放超过2秒，跳到第60秒后继续播放 |
| 云端部署 | [Vercel dpl_9jNprhXD3HcdN84L4kRqi1z1kBKy](https://vercel.com/rerisse7-1717s-projects/joyflix-web-v2-preview/9jNprhXD3HcdN84L4kRqi1z1kBKy) | 源码 `67374420dd7b2cce16a0653be5bb6da7991a0489`，`READY`，`target=null`（Preview），构建 `Deployment completed`，SSO保护 `all` |
| 旧生产对照 | 生产别名 `wpujoyflix.vercel.app` | 仍映射旧 `dpl_FeD6QjKhiPruz8pJFgaT4YCdYZpk`；未被新部署覆盖 |

浏览器的实际测试只运行在**美国 GitHub Runner**。未对中国内地网络、iPhone Safari、华为安卓、视频持续10分钟无缓冲或片尾自然结束做成功声明。**两部真实开放电影的成功不能推出热门商业电影或电视剧已有稳定来源。**

## 五、最新测试入口（必须登录受保护预览）

- Web V2 首页：<https://joyflix-web-v2-preview-of4z2hxjw-rerisse7-1717s-projects.vercel.app/v2>
- 片源实验室：<https://joyflix-web-v2-preview-of4z2hxjw-rerisse7-1717s-projects.vercel.app/v2/qa/source-lab>
- Spring 详情：<https://joyflix-web-v2-preview-of4z2hxjw-rerisse7-1717s-projects.vercel.app/v2/watch?source=blender-spring&id=spring2019>
- Big Buck Bunny 详情：<https://joyflix-web-v2-preview-of4z2hxjw-rerisse7-1717s-projects.vercel.app/v2/watch?source=blender-bunny&id=bunny2008>

不要自动创建免登录分享链接、关闭 Vercel Authentication 或更改生产 alias。部署 READY 不能替代用户登录后的真实网站访问验证；需由本人在有权限浏览器直接打开。

## 六、下一阶段决策及止损门槛

1. **优先测试用户真实找到的来源，而非继续堆 Demo。** 已有 /v2/qa/source-lab 可测试被用户允许使用的 HLS/MP4/WebM 直链；对于 CMS JSON 必须有不带凭据的接口结构、具体许可及实际可播放的节目，否则不能默认批准。
2. 对用户实际想看的影视内容，验收「搜索→详情→集数→首帧→连续播放10分钟→跳播→结束」；浏览器能否跨域取得 HLS 分片、视频编码是否支持、站点授权和源稳定性是独立门槛。
3. 国内真机：Android Chrome / iPhone Safari 分别看两部授权影片及已核准HLS来源。Commons WebM 的 iPhone 编码兼容可能不同，不能把美国Chrome结果代表手机。
4. 在有持续有效的真实内容供应后，再设计弹幕稳定作品ID、分集、剪辑版本和时间偏移，并添加 Agnes 即时规则及AI复审、人工举报处理。不要以弹幕数量/测试数量代替可看的内容。
5. Web 迁移未完成、合规与许可未验收前不合并 JoyFlix `main`，也不把 `wpuu/TV` 改造成 FongMi 正式客户端。

**结论：本轮 SourceHub 从空片源骨架跨越到了“两部授权完整短片在真正 Web V2 前端能显示、搜索、打开并在 Chrome 实播”的工程闭环。尚未得到真正适合商业运营的热门影视内容供应。**

TV126完成
