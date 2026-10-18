# 观局 · MPI 四象限思考画布

在 Codex 中对话，在画布上看见同一困局的不同面向及其联系。

项目仓库：[vactioncn/SYSTEMTHINKING](https://github.com/vactioncn/SYSTEMTHINKING)。新电脑可执行 `git clone https://github.com/vactioncn/SYSTEMTHINKING.git`，然后在 Codex 中打开克隆所得的 `SYSTEMTHINKING` 目录。

**换电脑继续开发，请先读 [项目交接与续作说明书](HANDOFF.md)。** 其中记录了“设计四象限思考画布”和“优化四象限画布编辑体验”两个任务的停点、待办、验收与 GitHub 迁移步骤。当前系统回路已有实现，尚待完成全面交互与视觉验收；四象限手动添加、编辑现象依据及自由摆放是用户已提出但尚未实现的需求。下文的四象限只读说明描述当前实现。

## 理论背景与应用场景

四象限是肯·威尔伯（Ken Wilber）整合理论的一部分，用“个体／集体”和“内在／外在”两个维度交叉观察同一件事情。四个面向同时存在、相互影响，不是四个阶段或重要性排序。

| 固定位置 | 象限 | 本工具中的关注点 |
| --- | --- | --- |
| 左上 | I · 个体内在 | 我的信念、感受、顾虑、恐惧与内心想法 |
| 右上 | It · 个体外在 | 具体行为、事件、能力及可观察的表现 |
| 左下 | We · 集体内在 | 共同文化、默认规则、互动习惯、共享信念 |
| 右下 | Its · 集体外在 | 分工、制度、流程、考核、资源和外部条件 |

参考：[Integral Life · What Are the Four Quadrants?](https://integrallife.com/quadrants/)

本次采用用户描述的 JOEY 课堂练习：共同困局放在中央，从 It 还原具体画面，深入 Its 中现有安排怎样运作以及为什么这样安排；出现共同文化或个人信念时，再连接 We 或 I。这个练习流程与理论框架分开说明，不声称这是原理论规定的唯一顺序。

适用于反复出现、涉及多方的经营困局，例如销售持续未达标、交付问题反复发生、跨部门协作受阻。先理解现状及联系，再决定是否进入方案讨论。当前版本不自动生成管理建议或完整因果闭环。

## 当前环境能做到什么

当前环境提供本地文件读写、命令执行和 Codex 内置浏览器。因此采用本地服务加结构化文件：你发送消息，Codex 澄清、整理并保存文件，打开的画布在下一次读取时自动更新（约一秒）。每轮记录、问题和联系都可继续修订。

这不是后台逐字监听所有聊天：Codex 必须在完成当轮整理后调用保存工具。服务需保持运行；电脑重启后数据仍在，重新启动即可。服务只绑定 `127.0.0.1`，没有发布到外网，不提供跨电脑云同步或多人同时编辑。团队练习可以在同一屏幕看画布，或分享可交互的离线 HTML。无需另开聊天工具、安装依赖或提供 API key。

官方浏览器说明：[OpenAI · Browser](https://learn.chatgpt.com/docs/browser?surface=app)。此项目的对话更新能力通过本地文件和浏览器实际验证，不依赖未提供的聊天消息订阅接口。

## 打开与使用

在 Codex 中说“打开画布，继续上次的困局”即可；本项目的 `AGENTS.md` 记录了延续对话的工作约定。

手动启动只需要：

```sh
# 先进入你在这台电脑上克隆或保存的 MPI 项目目录
python3 server.py
```

访问 [本地画布](http://127.0.0.1:4317/)。默认进入真实记录；“看看教学示例”只演示需求中的举例，不写入真实记录。当前真实议题和内容以 `data/state.json` 为准。

- 点击卡片：看原话、详情、核实状态、问号和相关联系。
- 选择一条线索：聚焦相关记录；“探寻线索”提供文字顺序阅读和联系依据。
- 使用缩放按钮、拖动空白处或滚动查看；“适应画布”恢复概览。窄屏默认折叠较多卡片，使用“还有 N 条”展开；也可以聚焦某条线索再展开详情。
- “讨论记录”：只读回看每个版本，不覆盖最新记录。
- “保存与导出”：JSON 保留结构，HTML 保留可展开和缩放的离线画布。离线文件不会同步后续对话。把导出的 JSON 放回本项目并告诉 Codex 继续，即可由 Codex 校验、合并后保存。

## 文件与结构

| 文件 | 用途 |
| --- | --- |
| `data/state.json` | 当前真实记录，唯一内容来源 |
| `data/history/N.json` | 第 N 版完整快照，保留修订前后内容 |
| `examples/sales.json` | 独立教学示例，全部明确标注来源和待核实信息 |
| `scripts/update_canvas.py` | 校验、检查版本冲突并保存 |
| `store.py` | 结构校验、文件锁、原子写入 |
| `server.py` | 四象限只读接口、回路图读写接口与离线导出 |
| `web/` | 四象限、线索、历史、方法说明与详情界面 |

数据使用稳定编号：

- `topic`：title、status（pending / confirmed）、sourceIds。
- `sources`：id、origin（user / record / exercise）、label、quote。真实记录拒绝 exercise 来源。
- `nodes`：id、quadrant（I / It / We / Its）、kind（opinion / observation / outcome / system / clue）、status（reported / verified / hypothesis / revised）、title、detail、sourceIds、openQuestions；可选 fields 存“谁决定”等具体情况。verified 需要 verification，说明核实依据。
- `links`：id、from、to、label、status（confirmed / hypothesis）、basis、sourceIds。确认联系不等于证明因果。列表顺序或放进同一线索本身不建立因果。
- `threads`：id、title、nodeIds，可包含跨象限的记录。
- `questions`：本轮最多两个关键问题；每条卡片可另存尚未展开的问号。
- `revision`、`updatedAt`、`changeSummary`：保存版本、时间、本轮修改说明。

来源请保留用户真实措辞；不要替用户补充数字、人物或实际安排。观点更新为更准确的表述时保留 id，历史快照保留原判断。

## Codex 保存方式

先读取当前版本：

```sh
python3 scripts/update_canvas.py
```

基于读取结果准备完整候选 `data/draft.json`，保留当前 revision。校验后提交，例如当前版本为 0：

```sh
python3 scripts/update_canvas.py data/draft.json --check
python3 scripts/update_canvas.py data/draft.json --expect 0
```

保存工具会产生第 1 版、时间和历史快照。版本冲突时重新读取合并。四象限 HTTP 接口只读；回路图使用下面的独立编辑接口。

## 系统回路编辑器

从左侧“系统回路”进入 [回路图工作区](http://127.0.0.1:4317/loops)。用户提供的图片已重绘为可编辑的独立示例；真实分析另存一张空白图。图集支持新增、复制、切换与删除，删除可撤销或从历史中取回副本。

- **绘图**：点“变量”再点画布，或双击空白处添加。点“连线”后依次点起点、终点；右侧设置正负影响、核实状态、延迟、颜色、说明与依据。选中连线后拖动两个控制点调整弧线，端点随变量移动。自连线、多个同端点连线及跨回路共享变量均可保存。
- **回路**：Shift 点击选择现有连线，再点“回路”；也可在属性中勾选成员。回路背景、范围、名称、描述、徽章位置均可调整。R 表示偶数个负向关系的强化回路，B 表示奇数个负向关系的调节回路。所选关系必须是单一有向闭环且极性明确，否则保留 `?`。包含待核实关系的回路仍是工作假设。
- **复杂图**：缩放、平移、Shift 多选或框选变量、搜索定位、聚焦回路、缩略导航。整理布局按连通部分分布变量，保留全部语义关系；复杂交叉仍可能需要手工调整。可从四象限选择记录作为变量起点，不会自动建立因果关系。
- **保存与分享**：自动保存、80 步会话撤销/重做、持久历史版本；SVG 保留矢量清晰度，PNG 最长边不超过 8192 像素，JSON 保留完整可编辑结构。JSON 导入为新图，不替换原图。演示模式隐藏编辑控件。
- **对话同步**：继续在 Codex 中说明希望如何画，agent 保存后约两秒同步。网页与 agent 同时修改产生版本冲突时，网页保留本地草稿，可将改动另存为副本合并，也可下载草稿后载入最新。异常退出后的未保存草稿可在重开时恢复。这里仍没有第二个聊天窗口。

实现保持无第三方运行依赖：Python 标准库负责版本锁、校验、历史和原子写入；原生 SVG 负责绘图、缩放及导出。数据、图算法、几何、界面交互分别存储，便于以后增加布局算法、其他导出格式和协作能力。

| 文件 | 用途 |
| --- | --- |
| `data/loops.json` | 当前图集（独立于四象限记录） |
| `data/loop-history/N.json` | 图集第 N 版完整快照 |
| `examples/presales-loop.json` | 根据参考图重绘的独立案例 |
| `loop_store.py` | 图数据校验、版本锁与原子保存 |
| `scripts/update_loops.py` | Codex 更新入口 |
| `web/loops/core.js` | 回路判定、几何、布局、SVG 序列化 |
| `web/loops/editor.js` | 编辑操作、撤销、同步与导出交互 |

图集格式为 `{schemaVersion: 1, revision, updatedAt, changeSummary, diagrams: [...]}`。每张图包含 `id/title/subtitle/mode/notes/nodes/edges/loops`：

- `nodes`：`id/label/x/y/width/fontSize/color/notes/sourceNodeIds`。布局坐标与内容一起保存。
- `edges`：`id/from/to/polarity/status/delay/color/label/basis/route/labelPosition/labelOffset`。`route.c1` 和 `route.c2` 各存 `{along, offset}`：沿两端变量中心连线的相对位置和法向偏移。变量移动后，弧线控制仍保持相对关系。
- `loops`：`id/title/description/color/edgeIds/x/y/rx/ry/labelX/labelY`。只引用已有边，可共享边和变量。R/B 在读取时计算，不存一份可能过时的回路类型。

Codex 先读取，再合并完整候选；例如当前图集版本为 1：

```sh
python3 scripts/update_loops.py
python3 scripts/update_loops.py data/loops-draft.json --check
python3 scripts/update_loops.py data/loops-draft.json --expect 1
```

不要直接覆盖 `data/loops.json` 或历史文件。原图、已写入的引用与其他图必须保留。不要从参考案例推断真实公司的因果结论。

图模型不限定模板、变量数或回路数，但不承诺无限规模：保存请求上限 16 MB，浏览器性能与屏幕可读性仍有限。自动测试验证了 1,000 个变量、2,000 条连线的保存和 SVG 生成；这不等于所有设备上同样规模的交互性能保证。高密度图建议分图或聚焦阅读。

## 验证

```sh
python3 -m unittest discover -s tests -v
node --check web/app.js
node --check web/loops/editor.js
node --check web/loops/core.js
node --test tests/test_loops.mjs
```

使用独立临时目录测试修订保存、稳定编号、历史不变、并发冲突、无效引用、教学示例隔离、核实依据、HTTP 历史及离线导出。真实记录不参与合成数据测试。
