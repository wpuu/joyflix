# 2026-10-28 / TV129：真实 CMS 浏览器兼容性审计及路线决策

## 目标

项目：wpuu/joyflix，开发分支 feature/web-v2-migration-20261027。

不再将“TVBox中发现来源”直接当成“Web浏览器可观看影片”。修正历史源筛选误判，用固定公开配置和真实Chrome核对浏览器端CORS事实，同时保留旧JoyFlix生产、TV Web归档和受保护Preview。

## 一、真实固定样本

公开源：[TVboxorg/TVbox](https://github.com/TVboxorg/TVbox)，固定提交 0bb8a8061b41dd79276a601830f854792f5e348a 中的 dist/official.json。

该配置160条sites：type=3 Spider共142条；type=1 JSON HTTP共18条；基础格式条件筛出15条。

发现旧实现会把其中6条带原始查询参数（URL中包含问号及后续参数）的接口去掉参数之后仍视为可测试。修改参数可能导致功能含义改变，且参数也可能包含凭据。本轮修复：任何原始查询参数均触发 QUERY_UNSUPPORTED / API_QUERY_REQUIRES_REVIEW，不能“偷偷删掉并继续请求”，使可手动探测候选从15条降到9条。这不是判定6条源坏了，而是说明不能在未核查情况下把它们计入可用。

## 二、9条真实浏览器HTTP/CORS检查

专用实验使用美国 GitHub Runner 的真实 Chrome，从临时 127.0.0.1 空白网页作为源站发起跨域请求。对9个通过预定义公有主机白名单的候选各请求一次不存在的测试关键词，先检查公有IPv4 DNS，禁止凭据、重定向、Referer、后台服务端代理，最多读取16KB数据，不保存电影列表、演员信息、播放地址、分片、视频字节或私密资料。

| 样本序号 | 固定公开配置中标识 | 实际分类 |
| --- | --- | --- |
| C01 | 量子资源 | CORS_OR_NETWORK |
| C02 | 奇虎资源 | DNS_UNVERIFIED（未发请求） |
| C03 | 虎牙采集 | CORS_OR_NETWORK |
| C04 | MTV合集 | CORS_OR_NETWORK |
| C05 | 如意资源 | CORS_OR_NETWORK |
| C06 | 淘片采集 | CORS_OR_NETWORK |
| C07 | 火狐采集 | CORS_OR_NETWORK |
| C08 | 暴风采集 | CORS_JSON_CMS_ENVELOPE（HTTP 200、JSON list结构） |
| C09 | 索尼采集（无查询参数的配置版本） | CORS_OR_NETWORK |

**汇总：1条读到CMS JSON结构、7条CORS或网络不通、1条未通过DNS安全检查。**

关于证据的限制：
- CORS_OR_NETWORK混合了跨域、TLS、网络、DNS和重定向可能性，不能直接指认“网站设置错误”。
- C02 DNS_UNVERIFIED仅是该次IPv4安全验证无法确认，不证明永久不可用。
- C08只是约85字节的无实际电影名关键词搜索响应，不能代表热门影视作品有数据、分集能打开、媒体能播放，亦不代表版权和传播权获得核准。
- 回环Chrome的CORS结果不能直接推广到受保护的Vercel域名、中国网络、安卓与iPhone。
- 这九条仅做元数据兼容研究，全部未导入公开SourceHub，也没有下载任何真实影视媒体。

[审计CI #40691175124](https://github.com/wpuu/joyflix/actions/runs/40691175124) ：completed/success。日志为 TV129_PUBLIC_JSON_HTTP_AUDIT，9/9完成，类别分布 CORS_OR_NETWORK=7、DNS_UNVERIFIED=1、CORS_JSON_CMS_ENVELOPE=1。

## 三、代码提交与回归测试

- [dfa613d](https://github.com/wpuu/joyflix/commit/dfa613d5d93ec8b95bb5d6a8c1742cec4ae3328b)：修复 CMS 查询参数静默删除造成的虚假兼容；新增分类与脱敏报告中的 query_parameter_review 计数；增加相关失败回归。
- [599e3d3](https://github.com/wpuu/joyflix/commit/599e3d34572ecd6cb2bb43c29eb8a1ea556ccf81)：独立GitHub Actions和真实Chrome有限搜索兼容审计；没有触碰原有媒体路由或Production。
- [主CI #40690861818](https://github.com/wpuu/joyflix/actions/runs/40690861818)：52/52单元与合同测试通过，Next.js14整站构建、SourceHub真实HTTP路由及环境阻断检查通过。
- [真实媒体Chrome CI #40690861586](https://github.com/wpuu/joyflix/actions/runs/40690861586)：原有两部CC BY完整电影首帧与跳播回归2/2通过；隔离模拟CMS到真实授权影片的浏览器播放回归1/1通过。
- [实际外部CMS元数据CI #40691175124](https://github.com/wpuu/joyflix/actions/runs/40691175124)：仅元数据读取，不可描述为商业影视站可播放性通过。

## 四、部署与不变边界

- 受保护独立 Vercel Preview： [dpl_45bZdmxbjGStFCuCAeWdjhKhczwY](https://vercel.com/rerisse7-1717s-projects/joyflix-web-v2-preview/45bZdmxbjGStFCuCAeWdjhKhczwY)，READY、target=null、源码SHA 599e3d34572ecd6cb2bb43c29eb8a1ea556ccf81；Vercel Authentication 继续启用 all。
- 实验室地址：https://joyflix-web-v2-preview-aysk5ge29-rerisse7-1717s-projects.vercel.app/v2/qa/source-lab
- 正式 wpujoyflix.vercel.app 仍映射旧 dpl_FeD6QjKhiPruz8pJFgaT4YCdYZpk；joyflix main SHA为3b1c02d；wpuu/TV原私有新版Web开发分支仍为996807f。没有生产切流、没有扩展公开采集目录。

## 五、路线决定与下一轮实际工作

1. **Web端不能假设 TVBox 聚合源可以直接支持普通浏览器影视播放**。本轮九条只有一条具有JSON结构可读的初步事实，其余尚未验证；所有来源版权、播放段与供应稳定性都未知。Web应优先寻求内容使用权明确、跨域可控、带宽可承担的自有或商业授权媒体接口。
2. **Android路线提高优先级**。FongMi/TV项目最近的 fongmi 分支实际提交为123cc086159b0f13bf54bdf64bacbc259ca47c88（2026-10-26），移动端和TV端分别有mobile与leanback flavor；源码包含catvod、chaquo、nodejs、quickjs和其他原生模块。Android工程使用Gradle 9.7.1、Java 21，且构建读取local.properties中的签名设置。建议下一轮在wpuu/TV独立实验分支进行最小Android构建基线，使用独立的测试签名与空环境，不替换原TV Web归档与main。原生插件可运行不意味着自动获得影片分发权，GPL-3.0许可义务仍需单独核查。
3. 不加播放 URL 代理、不抓取未获许可的影视目录、不以绕过鉴权、CORS或DRM的方式弥补供给问题。
4. 有持久合法且实际能播放的完整影视资源后，才推进弹幕时间轴、Agnes 3.0 Flash 即时规则/异步审核、用户举报和社区建设。

**TV129最终状态：筛选口径误判已修复；9个真实CMS的浏览器元数据兼容调查已完成；独立Web Preview READY；真正适合商业运营的热门影视内容来源仍未取得。**

TV129完成
