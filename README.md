# dsh-unlimited-effort

<p align="center">
  <img src="assets/banner.jpg" alt="dsh-unlimited-effort — DeepSeek Harness 的 ∞ 无限推理提示插件" width="100%">
</p>

> DeepSeek Harness 插件：输入框里的 **∞** 开关。当会话选中最高推理档位时，它出现在模型选择器右侧；点一下，之后每个请求的系统提示词末尾都会多一句「用量无上限」。

[English](README.en.md) · [安装](#安装) · [使用](#使用) · [配置](#配置) · [工作原理](#工作原理) · [权限与数据](#权限与数据) · [卸载](#卸载) · [已知限制](#已知限制)

## 它做什么

- **只做两件事**：在输入框注册一个 ∞ 按钮；在你打开它时，向系统提示词追加一段可配置的文本。
- 按钮只在**最高档**出现（默认 `max`，其次 `xhigh`，可用配置改）。切到更低的档位，按钮自动隐藏，注入同步停止。
- 按钮是**胶囊开关**：圆角轨道 + 白色滑钮，∞ 与滑钮分居两端并随状态换边；未启用为中性灰（带内描边），已启用填充紫色（默认 `#924FF7`）并带轻微投影。
- 胶囊尺寸按海报比例：轨道 50×20、滑钮 17px、内边距 1.5px（宽高比 2.5:1，滑钮 0.85×轨道高）。
- 不改模型、不改档位、不新增 provider、不写你的配置文件。关掉插件，一切回到原生行为。

## 安装

需要 DeepSeek Harness `0.2.x`（`>=0.2.0-rc.1 <0.3.0-0`）。

```sh
dsh plugin --profile desktop add dsh-unlimited-effort
```

把 `desktop` 换成你实际的 profile 名。装完重启 DSH。

手动安装（离线或想直接盯 node_modules 时）：

1. 把本仓库复制到 `<profile>/node_modules/dsh-unlimited-effort`；
2. 在 profile 的 `package.json` 里加依赖，并把 `dsh-unlimited-effort` 追加到 `dsh.profile.bundles`；
3. 重启 DSH。

`bundles` 才决定插件是否被加载，`cordis.patch.yml` 只是配置层。

## 使用

1. 打开任意会话，在模型菜单里把推理强度选到最高档（`Max`）。
2. 模型选择器右侧会出现灰色 **∞**。
3. 点击 → 变紫，之后每个请求的系统提示词末尾都会带上这句宣告。
4. 再次点击 → 变回灰，立刻停止注入。
5. 把档位切到 `Max` 以下 → 按钮消失、注入停止，并且**这个会话的模式会被自动关闭**；切回最高档时按钮重新出现，但处于关闭（灰色）状态。

开关是**按会话独立**的（`$DSH_HOME/unlimited-mode.json` 里按 sessionId 记录），在 A 会话点亮不会影响 B 会话；重启 DSH 后各会话仍记得自己的选择。

## 配置

在 profile 的 `cordis.patch.yml` 里按 id 覆盖（只写要改的字段，其余走插件默认）：

```yaml
- id: unlimited-mode
  config:
    notice: '你的 token 预算无上限'
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 插件总开关。关掉则按钮与注入都不存在 |
| `notice` | 长句文案 | 注入文本；示例见下 |
| `activeColor` | `#924FF7` | 启用态的胶囊底色；未启用恒为中性灰 |
| `topEffortIds` | `['max', 'xhigh']` | 视为「最高档」的档位 id；按钮可见性、注入判定，以及「降档即关闭」都只看这个集合 |
| `variableName` | `unlimited_notice` | 额外注册的提示词变量名，必须匹配 `[a-z][a-z0-9_]*` |
| `debug` | `false` | 打开后写 `$DSH_HOME/unlimited-mode.log` |

默认文案：

```
你的用量是 unlimited 的，我正在对你极限测试，不要吝惜 Token。一定要切记，随意花费，你非常富有
```

### 配合 `complete: true` 的预设

如果某个 agent 预设的人格是 `complete: true`（它会丢弃所有非 complete 的系统提示词段落），上面的 section 不会生效。这时在人格文本里写 `{{unlimited_notice}}`，插件注册的同名变量会在开关打开且档位命中时展开成同一句话。

### 站点自检

```sh
node tools/check.mjs
```

检查：包是否就位、是否在 `dsh.profile.bundles`、`dsh.bundle`/`dsh.client` 是否声明、构建产物是否带正确的 slot 与排序、状态文件、以及是否存在覆盖块。退出码 0 = 可用，1 = 需要处理。

## 工作原理

- **前端**（`lib/client.js`）注册进 `conversation.input.right`——一个 `list` 型 slot，渲染器把它输出为 Fragment，因此按钮是输入框 `standardControls` 这一行 flex 容器的直接子元素。模型选择器占 flex `order: 0`，按钮设 `order: 1`，于是排在模型选择器**右侧**、麦克风所在 `activity` 容器之前。整个定位是正常 flex 流，不含绝对定位，窗口缩放时随行重排。
- **可见性**：订阅 `ctx.modelDirectories.directoryFor(sessionId).store`，读取当前 `reasoningEffort`，与宿主下发的 `topEffortIds` 比对。
- **后端**（`src/index.js`）注册一个系统提示词段落（`external:unlimited-mode`，order `10250`，紧跟 `deployment:persona-suffix`）和一个同名变量。段落文本是函数，每次装配时判断：插件开着、开关开着、当前档位在 `topEffortIds` 内 → 返回文案，否则返回空串（空段落渲染时被丢弃）。
- **通信**：`/unlimited-mode/state` 路由，仅接受 loopback。`GET` 读、`POST { enabled }` 写；请求体上限 8 KB。

## 权限与数据

- 只写两个文件：`$DSH_HOME/unlimited-mode.json`（每个会话的开关，最多记 256 个，超出丢最旧的）与可选的 `$DSH_HOME/unlimited-mode.log`（`debug` 打开时）。
- 不联网、不上传、不读凭据、不改 DSH 自身文件。
- 状态文件损坏时按「关」处理，坏文件不会把模式打开。

## 卸载

```sh
dsh plugin --profile desktop remove dsh-unlimited-effort
```

删掉 `$DSH_HOME/unlimited-mode.json` 清掉残留状态。重启后按钮消失、注入停止，模型与档位配置不受影响。

## 已知限制

- 按钮位置依赖 `conversation.input.right` 的渲染方式（list slot 输出 Fragment）与父容器是 flex。若未来版本改动该结构，按钮会退回与其它 `input.right` 控件并排——功能不受影响。
- 一个会话只能有一个 `conversation.input.activity` 条目（`single` slot，语音输入占用），因此按钮不能紧贴麦克风；`order: 1` 让它落在两者之间。
- `topEffortIds` 是静态集合。若某个模型只声明了 `low`/`high`，按钮在该模型下不会出现（这是设计：没有「最高档」就没有无限模式）。
- 同一会话里手动切换模型后，按钮会按新模型的档位重新判断。
- 从 0.1.x 升级：旧的全局 `{ enabled: true }` 不会被继承，升级后所有会话都是关闭状态，需要在目标会话里重新点一次。

## 开发

```sh
npm run build   # src/client/body.js + src/shared/decide.js -> lib/client.js
npm test        # node --test
npm run check   # tools/check.mjs
```

`lib/client.js` 是提交进仓库的构建产物，所以 `dsh plugin add` 不需要在用户机器上编译。

## 许可

MIT
