# DSH Action Parity

证明一个业务动作只实现一次，并被 DeepSeek Harness 的 CLI、MCP、GUI 一致调用。插件不执行真实业务动作，也不靠截图猜按钮；它核验稳定 Action ID、内容寻址的动作核心与绑定声明，以及各界面产生的结构化回放观察。

它检查三种界面是否绑定同一个 `coreActionId`、GUI 是否暴露 `data-action-id:<actionId>`、核心/绑定/fixture 的 SHA-256 是否仍新鲜、同一 fixture 的结果摘要与状态版本迁移是否一致、陈旧写是否以 `STALE_STATE` 拒绝且不改状态、需要确认的动作是否在所有界面强制确认。缺失、陈旧和分歧会进入确定性的内容寻址报告。

```sh
dsh plugin --profile web add github:dongsheng123132/dsh-action-parity
dsh-action-parity verify --workspace-root examples/basic --manifest action-parity.manifest.json --observations observations.jsonl --artifact-dir artifacts
```

输入路径和输出目录必须位于 `workspaceRoot` 内，拒绝符号链接；报告不含秘密、原始输入输出、argv、stdout 或 stderr。插件注册 `dsh_action_parity_inspect` 与 `dsh_action_parity_verify`。

MIT
