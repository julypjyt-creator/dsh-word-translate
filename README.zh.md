# dsh-word-translate

[English](README.md) | 中文

在 DSH 对话里（你自己的消息或助手的回复）选中一个英文单词，右击就会弹出一个小卡片，上面有 **翻译成中文**。点一下，中文释义直接显示在卡片里，可以复制译文；不用再把单词复制到浏览器或词典里查，也不需要任何 API Key。

![在对话里右击英文单词即可看到中文释义](docs/preview.svg)

## 安装

```sh
dsh plugin add dsh-word-translate
```

也可以在插件页的 **Discover** 里搜索 `dsh-word-translate` 后安装。插件作用于整个 profile，重启后依然保留。

## 市场来源

想让市场列出这个插件（带图标和中文简介），在「插件 → 发现 → 索引源」里添加：

```
https://cdn.jsdelivr.net/gh/julypjyt-creator/dsh-word-translate@main/market/index.json
```

`raw.githubusercontent.com` 在国内网络经常连不上，DSH 拉索引超过 10 秒就会报 `Connect Timeout Error`，所以这里用 jsDelivr 镜像；索引里的图标是相对路径，同样走这个镜像。jsDelivr 对分支内容有缓存，改完 `market/index.json` 后可能几分钟才生效。

## 使用

1. 在任意消息里选中一个英文单词；不选中也可以，鼠标停在单词上就行。
2. 右击。原来的系统菜单会被替换成一张小卡片，显示你选中的词。
3. 点 **翻译成中文**，译文显示在卡片里；**复制译文** 复制结果，**重试** 重新请求。

按 `Esc`、点击卡片外部或滚动页面即可关闭。输入框、文本域和可编辑文本里的右击保持原生菜单，不影响输入。

单次最多翻译 800 个字符，单词或短语远低于这个上限。

## 配置

可选，写进 profile 的 `cordis.patch.yml` 中本插件的 `config`：

| 键 | 含义 | 默认值 |
| --- | --- | --- |
| `providers` | 依次尝试的翻译提供方：`['bing']`、`['google']` 或两者 | `['bing', 'google']` |
| `targetLanguage` | `zh-CN` 简体、`zh-TW` 繁体 | `zh-CN` |
| `maxChars` | 单次翻译的最大字符数（最多 2000） | `2000` |

## 隐私

选中的文本会发送到匿名的机器翻译接口：[Bing](https://edge.microsoft.com/translate/translatetext) 优先、[Google](https://translate.googleapis.com/translate_a/single) 兜底。不做任何存储——译文只缓存在当前进程内存里（最多 500 条），插件不会把文本发到别处。关闭插件会一并移除右击卡片、两个路由和缓存。

## 接口

- `POST /dsh-word-translate/translate`，请求体 `{"text": "...", "targetLanguage": "zh-CN"}`，返回 `{"ok": true, "translation": "...", "provider": "bing", "cached": false, "truncated": false}`。
- `GET /dsh-word-translate/health`，返回当前提供方、目标语言与缓存条目数。

两个路由和 DSH 其余 HTTP 路由一样只监听本机回环地址。单次请求 10 秒超时，响应体上限 1 MiB。

## 已知限制

- 只翻译拉丁字母词；不含 `A-Z` 的文本会被拒绝。
- 在链接上（或链接里的单词上）右击会打开翻译卡片，而不是浏览器的链接菜单。
- 结果依赖公共翻译接口；两者都失败时卡片会显示错误并提供 **重试**。

## 许可

MIT
