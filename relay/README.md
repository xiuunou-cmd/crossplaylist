# crossplaylist-relay

ニコニコAPI（CORS遮断）を中継するCloudflare Worker。
本番URL: https://crossplaylist-relay.xiuunou-cmd.workers.dev

- フロント側の参照箇所: `crossplaylist.html` の `NICO_RELAY` 定数
- Cloudflare管理画面: https://dash.cloudflare.com → Workers & Pages → crossplaylist-relay
- 無料枠: 10万リクエスト/日（個人利用なら実質無制限）

## エンドポイント

| パス | 内容 |
|---|---|
| `/mylist/{id}?page=N` | 公開マイリスト（nvapi v2） |
| `/series/{id}?page=N` | シリーズ（nvapi v2） |
| `/user/{id}?page=N` | ユーザーの投稿動画（nvapi v3） |
| `/video/{id}` | 単一動画のタイトル・サムネ（getthumbinfo） |

応答は `{name, items:[{id,title,thumb}], hasNext}` に正規化。
許可オリジン: `https://xiuunou-cmd.github.io` と localhost のみ。

## 更新手順（worker.jsを変更したら）

```
cd このフォルダ
npx wrangler deploy
```

初回や別PCでは `npx wrangler login`（ブラウザで承認）が先に必要。

## ローカル開発

```
npx wrangler dev --port 8787   # ログイン不要
```

crossplaylist.html は localhost で開くと自動的に http://127.0.0.1:8787 を参照する。

## 注意

nvapi はニコニコの非公開内部APIのため、ニコニコ側の改修で予告なく壊れる可能性がある。
壊れた場合はレスポンス形状の変化を確認して worker.js の `ROUTES` を追従させる。
（公式のスナップショット検索APIはマイリスト等に非対応のため使っていない）
