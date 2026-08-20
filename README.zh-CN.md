# DSH Action Parity

[![CI](https://github.com/dongsheng123132/dsh-action-parity/actions/workflows/ci.yml/badge.svg)](https://github.com/dongsheng123132/dsh-action-parity/actions/workflows/ci.yml)
[![MIT 许可证](https://img.shields.io/github/license/dongsheng123132/dsh-action-parity)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](package.json)
[![Awesome DSH Plugins](https://img.shields.io/badge/Awesome_DSH-%E5%B7%B2%E9%AA%8C%E8%AF%81%E5%AE%9E%E9%AA%8C-0969da)](https://github.com/dongsheng123132/awesome-dsh-plugins/blob/main/README.zh-CN.md#2origin-%E6%8F%92%E4%BB%B6%E5%AE%9E%E9%AA%8C%E5%AE%A4)

证明一个业务动作只实现一次，并被 DeepSeek Harness 的 CLI、MCP、GUI 一致调用。插件不执行真实业务动作，也不靠截图猜按钮；它核验稳定 Action ID、内容寻址的动作核心与绑定声明，以及各界面产生的结构化回放观察。0.2 版补齐正式 Codex 插件清单、只验结构化证据的 MCP 服务、真实 ToolRuntime 烟测，以及 stock DSH Web Loader 的命名空间导出回归测试。

它检查三种界面是否绑定同一个 `coreActionId`、GUI 是否暴露 `data-action-id:<actionId>`、核心/绑定/fixture 的 SHA-256 是否仍新鲜、同一 fixture 的结果摘要与状态版本迁移是否一致、陈旧写是否以 `STALE_STATE` 拒绝且不改状态、需要确认的动作是否在所有界面强制确认。缺失、陈旧和分歧会进入确定性的内容寻址报告。

```sh
dsh plugin --profile web add github:dongsheng123132/dsh-action-parity
dsh-action-parity verify --workspace-root examples/basic --manifest action-parity.manifest.json --observations observations.jsonl --artifact-dir artifacts
```

输入路径和输出目录必须位于 `workspaceRoot` 内，拒绝符号链接；报告不含秘密、原始输入输出、argv、stdout 或 stderr。插件注册 `dsh_action_parity_inspect` 与 `dsh_action_parity_verify`，包入口只暴露命名空间导出，因此能被 stock DSH Web profile 正常装载。

## Codex 与只读证据 MCP

正式 Codex bundle 通过 stdio 提供两个 MCP 工具：`action_parity_manifest_inspect` 校验内联 manifest，`action_parity_observations_verify` 对照 manifest 验证内联 JSONL envelope。它们不会读文件系统、解引用声明路径、执行动作或写 artifact，因此声明内容 hash 明确标记为未验证；需要 workspace 边界内的真实文件 hash 与原子落盘、回读验证报告时，请使用 DSH 工具或 CLI。

开发验证：

```sh
npm test
npm run check
npm run smoke:plugin
npm run smoke:mcp
npm run smoke:dsh
npm run smoke:web-loader
```

MIT
