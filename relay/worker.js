// CrossPlaylist リレー（Cloudflare Worker）
// ニコニコのAPIはブラウザからの直接アクセスをCORSで遮断しているため、
// ここで中継してCORSヘッダを付けて返す。応答は正規化して
// { name, items: [{id, title, thumb}], hasNext } の形に統一する。
//
// エンドポイント:
//   GET /mylist/{id}?page=N   公開マイリスト
//   GET /series/{id}?page=N   シリーズ
//   GET /user/{id}?page=N     ユーザーの投稿動画
//   GET /video/{id}           単一動画のタイトル・サムネ（getthumbinfo）

const NVAPI_HEADERS = {
  'X-Frontend-Id': '6',
  'X-Frontend-Version': '0',
  'User-Agent': 'CrossPlaylist-Relay/1.0 (+https://xiuunou-cmd.github.io/crossplaylist/)',
};

const PAGE_SIZE = 100;

function corsHeaders(origin) {
  const ok = origin === 'https://xiuunou-cmd.github.io'
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://xiuunou-cmd.github.io',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });
}

async function nvapi(url) {
  const r = await fetch(url, { headers: NVAPI_HEADERS });
  const j = await r.json();
  if (!j.meta || j.meta.status !== 200) {
    const e = new Error((j.meta && j.meta.errorCode) || 'nvapi error');
    e.status = (j.meta && j.meta.status) || 502;
    throw e;
  }
  return j.data;
}

const pickThumb = t => (t && (t.middleUrl || t.listingUrl || t.url)) || undefined;
const toItem = v => ({ id: v.id, title: v.title, thumb: pickThumb(v.thumbnail) });

const ROUTES = {
  async mylist(id, page) {
    const d = await nvapi(`https://nvapi.nicovideo.jp/v2/mylists/${id}?pageSize=${PAGE_SIZE}&page=${page}`);
    const m = d.mylist;
    return { name: m.name, items: (m.items || []).map(x => toItem(x.video)), hasNext: !!m.hasNext };
  },
  async series(id, page) {
    const d = await nvapi(`https://nvapi.nicovideo.jp/v2/series/${id}?pageSize=${PAGE_SIZE}&page=${page}`);
    return {
      name: d.detail && d.detail.title,
      items: (d.items || []).map(x => toItem(x.video)),
      hasNext: page * PAGE_SIZE < (d.totalCount || 0),
    };
  },
  async user(id, page) {
    const d = await nvapi(`https://nvapi.nicovideo.jp/v3/users/${id}/videos?sortKey=registeredAt&sortOrder=desc&pageSize=${PAGE_SIZE}&page=${page}`);
    const items = (d.items || []).map(x => toItem(x.essential));
    const owner = d.items && d.items[0] && d.items[0].essential.owner;
    return {
      name: owner && owner.name ? `${owner.name}の投稿動画` : '投稿動画',
      items,
      hasNext: page * PAGE_SIZE < (d.totalCount || 0),
    };
  },
  async video(id) {
    const r = await fetch(`https://ext.nicovideo.jp/api/getthumbinfo/${id}`, {
      headers: { 'User-Agent': NVAPI_HEADERS['User-Agent'] },
    });
    const xml = await r.text();
    if (!/status="ok"/.test(xml)) {
      const e = new Error('動画が見つかりません（削除済みの可能性）');
      e.status = 404;
      throw e;
    }
    const get = tag => { const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)); return m ? m[1] : ''; };
    const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
    return { items: [{ id, title: unesc(get('title')), thumb: get('thumbnail_url') || undefined }] };
  },
};

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders(origin), 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' },
      });
    }
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/(mylist|series|user|video)\/([a-z]{0,2}\d+)$/);
    if (!m) return json({ error: 'not found' }, 404, origin);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    try {
      return json(await ROUTES[m[1]](m[2], page), 200, origin);
    } catch (e) {
      const status = e.status >= 400 && e.status < 600 ? e.status : 502;
      return json({ error: e.message }, status, origin);
    }
  },
};
