# Word translate

When an unfamiliar English word shows up in a conversation, stop copying it elsewhere — select it, or just point at it, and right-click. A card appears with the Chinese meaning, in place.

![Right-click a word in the chat and its Chinese meaning appears in the card](preview.svg)

## Using it

- **Select, then right-click**: select a word or phrase (e.g. `idempotent`, `context window`), right-click, and choose 翻译成中文 in the card.
- **No selection needed**: right-click anywhere on a line and the word under the pointer is picked automatically.
- The card can **copy the translation** and **retry** on failure; the footer names the translation service that answered.
- Dismiss with `Esc`, a click outside, or by scrolling the conversation.
- **Inputs are untouched**: the composer and settings inputs keep the native context menu. Only message text is intercepted.

## Where the translation comes from

- Microsoft Bing's public translate endpoint first, Google as the fallback.
- **No API key, no login, no model tokens.** The result never enters the conversation, so the model never sees it.
- Only the word or phrase you looked up is sent; the rest of the conversation is not.

## Speed and caching

- An in-memory cache holds up to 500 lookups per profile, so repeated words answer instantly.
- Each request times out after 10 seconds; text is capped at 2000 characters, and selections longer than 800 characters are translated up to the limit and marked as truncated.

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `providers` | `["bing","google"]` | Translation services and their order |
| `targetLanguage` | `zh-CN` | Target language (`zh-TW`, etc.) |
| `maxChars` | `2000` | Per-request character cap |

Set them in the profile's `cordis.patch.yml` and reload the plugin.

## Known limitations

- English words and phrases only; pure Chinese or numeric text does not trigger it.
- Requires reachability of `edge.microsoft.com` or `translate.googleapis.com`; if both fail the card shows an error and a retry button.
- The card is the plugin's own overlay rather than an entry in the host menu, so the native context menu does not open over message text.

## Uninstalling

Disable or remove it under Plugins → Installed. No conversation data is touched.
