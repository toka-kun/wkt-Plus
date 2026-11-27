// ===== 共通ヘッダー(☰・サイト名・検索欄) =====
// 使い方: ページの header タグ一式の代わりに、同じ場所へ script タグを1つ置き、中身を wktHeader() だけにする
//   検索語があるページは、そのタグに属性 data-q を付けて、ejs の検索語(<%= ... %>)を入れる
//   動画ページは、属性 data-tool を付ける(ヘッダーの右端に、「ツール」ボタンが付く)
// 検索語は ejs が HTML エスケープして属性に入れるので、script の中身には書かない(書くと危ない)
// ☰ とサイト名は、このあとのサイドバーの処理が、左の枠(wkt-hdr-left)に足す
window.wktHeader = function () {
    const s = document.currentScript;
    if (!s) return;
    const tool = s.hasAttribute("data-tool");
    s.insertAdjacentHTML("beforebegin", `<header class="wkt-hdr">
        <div class="wkt-hdr-left"></div>
        <form action="/wkt/s" method="get" class="relative" id="searchForm">
            <input type="text" name="q" id="searchbox" placeholder="検索" aria-label="検索" class="searchbox w-full bg-gray-700 text-white" style="height:2.5rem;padding:0 5.25rem 0 1rem;border-radius:9999px">
            <button type="button" id="clearBtn" aria-label="検索欄を消す" class="absolute top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded-full hover:bg-gray-400 text-white text-lg leading-none hidden" style="right:2.75rem">×</button>
            <button type="submit" class="wkt-search-btn" aria-label="検索"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></button>
        </form>
        <div class="wkt-hdr-right">${tool ? `<button id="toggleToolbar" type="button" class="wkt-tool-btn" aria-controls="toolbar" title="この動画のツール(サムネのダウンロード・ほかのサイトで視聴)"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/></svg><span>ツール</span></button>` : ""}</div>
    </header>`);
    const box = document.getElementById("searchbox"), clear = document.getElementById("clearBtn");
    box.value = s.dataset.q || "";
    const sync = () => { clear.style.display = box.value ? "block" : "none"; };
    box.addEventListener("input", sync);
    clear.addEventListener("click", () => { box.value = ""; box.focus(); sync(); });
    sync();
};

// ===== 左サイドバー(広い画面: ヘッダーの下に常に出す。☰ で「広い」と「細い帯」を切り替える / 狭い画面: ☰ で上に重ねて出す) =====
// jQuery に頼らない。ヘッダー(header)を見つけて、☰ とサイト名を足す。ヘッダーを作り替えたらここも見直す
(function () {
    const root = document.documentElement;
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const isVideo = /^\/wkt\/(watch|w|yt)(\/|$)/.test(path);
    // ホームと動画ページは、もともとヘッダーがページと一緒に流れていた。他のページと同じ「固定」にして、本文を下げる
    if (isVideo || path === "/wkt") root.classList.add("wkt-flow");
    // 広い画面での形。"1" = 細い帯(アイコンと小さな文字)、"0" = 広い(アイコンと文字)。決めていなければ、動画ページは細い帯、ほかは広い
    const KEY = "wktNavMini";
    const stored = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
    const save = v => { try { localStorage.setItem(KEY, v); } catch (e) {} };
    const wide = matchMedia("(min-width:1024px)");
    // 本文が描画される前に余白を空けて、がたつきを防ぐ(余白は CSS の min-width で広い画面だけ効く)
    root.classList.add("wkt-pin");
    const s0 = stored();
    if (s0 === "1" || (s0 === null && isVideo)) root.classList.add("wkt-mini");

    const style = document.createElement("style");
    style.textContent = `
:root{--wkt-t:.3s cubic-bezier(.2,0,0,1)}
.wkt-hdr{position:fixed;top:0;left:0;width:100%;height:3.5rem;box-sizing:border-box;z-index:10;display:flex;align-items:center;gap:.75rem;padding:0 1rem 0 .5rem;background:#1f2937;color:#fff}
.wkt-hdr-left{flex:none;display:flex;align-items:center;gap:.25rem}
.wkt-hdr-right{flex:none;margin-left:auto;display:flex;align-items:center;gap:.25rem}
.wkt-hdr form{flex:0 1 50%;min-width:0}
.wkt-search-btn{position:absolute;right:.25rem;top:50%;transform:translateY(-50%);width:2.25rem;height:2.25rem;display:flex;align-items:center;justify-content:center;border:0;border-radius:9999px;background:none;color:#d1d5db;cursor:pointer;padding:0}
.wkt-search-btn:hover{background:#4b5563;color:#fff}
.wkt-hdr .wkt-tool-btn{flex:none;display:inline-flex;align-items:center;gap:.5rem;height:2.5rem;padding:0 1rem;border:0;border-radius:.5rem;background:#2563eb;color:#fff;font-size:.95rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .2s ease}
.wkt-hdr .wkt-tool-btn:hover{background:#1d4ed8}
.wkt-hdr .wkt-tool-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
.wkt-brand{flex:none;padding:0 .5rem;color:#fff;font-weight:700;font-size:1.125rem;line-height:1;text-decoration:none;white-space:nowrap}
html.wkt-flow body{padding-top:3.5rem}
#wktMenuBtn{flex:none;width:2.75rem;height:2.75rem;display:flex;align-items:center;justify-content:center;border:0;border-radius:.5rem;background:none;color:#d1d5db;cursor:pointer;padding:0}
#wktMenuBtn:hover,.wkt-nav-x:hover{background:#374151;color:#fff}
#wktNav{position:fixed;left:0;top:0;bottom:0;width:min(80vw,15rem);box-sizing:border-box;z-index:60;background:#1f2937;border-right:1px solid #374151;padding:.5rem 0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;transform:translateX(-100%);transition:transform .2s ease,width var(--wkt-t);word-break:normal}
#wktScrim{position:fixed;inset:0;z-index:59;background:rgba(0,0,0,.6);opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s}
html.wkt-open #wktNav{transform:none}
html.wkt-open #wktScrim{opacity:1;visibility:visible}
html.wkt-open{overflow:hidden}
.wkt-nav-head{display:flex;align-items:center;justify-content:space-between;padding:0 .5rem 0 1.25rem;color:#fff;font-weight:600}
.wkt-nav-x{width:2.75rem;height:2.75rem;display:flex;align-items:center;justify-content:center;border:0;border-radius:.5rem;background:none;color:#d1d5db;cursor:pointer;padding:0}
.wkt-nav-link{position:relative;display:block;height:2.75rem;border-radius:0;color:#d1d5db;text-decoration:none;font-size:.95rem}
.wkt-nav-link svg{position:absolute;left:1.25rem;top:50%;width:1.25rem;height:1.25rem;transform:translate(0,-50%)}
.wkt-nav-link span{position:absolute;left:3.25rem;top:50%;width:max-content;max-width:calc(100% - 4rem);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;transform:translate(0,-50%)}
.wkt-nav-link,.wkt-nav-link svg,.wkt-nav-link span{transition:height var(--wkt-t),font-size var(--wkt-t),left var(--wkt-t),top var(--wkt-t),width var(--wkt-t),max-width var(--wkt-t),transform var(--wkt-t)}
.wkt-nav-link:hover{background:#374151;color:#fff}
.wkt-nav-link[aria-current=page]{background:#374151;color:#fff;box-shadow:inset 3px 0 0 #3b82f6}
.wkt-nav-sep{height:1px;background:#374151;margin:.5rem 1.25rem;transition:margin var(--wkt-t)}
#wktNav:focus{outline:none}
#wktNav a:focus-visible,#wktNav button:focus-visible,#wktMenuBtn:focus-visible,.wkt-search-btn:focus-visible{outline:2px solid #60a5fa;outline-offset:-2px}
@media (max-width:639px){
  .wkt-hdr{gap:.5rem;padding:0 .5rem}
  .wkt-hdr form{flex:1 1 0}
  .wkt-brand{display:none}
}
@media (min-width:1024px){
  html.wkt-pin body{padding-left:15rem;transition:padding-left var(--wkt-t)}
  html.wkt-pin.wkt-mini body{padding-left:4.5rem}
  html.wkt-pin #wktNav{transform:none;top:3.5rem;width:15rem;z-index:20}
  html.wkt-pin.wkt-mini #wktNav{width:4.5rem}
  html.wkt-pin .wkt-nav-head{display:none}
  html.wkt-pin.wkt-mini .wkt-nav-link{height:4rem;font-size:.625rem}
  html.wkt-pin.wkt-mini .wkt-nav-link svg{left:50%;top:.625rem;width:1.5rem;height:1.5rem;transform:translate(-50%,0)}
  html.wkt-pin.wkt-mini .wkt-nav-link span{left:50%;top:2.5rem;max-width:calc(100% - .25rem);transform:translate(-50%,0)}
  html.wkt-pin.wkt-mini .wkt-nav-sep{margin:.5rem .75rem}
}
@media (prefers-reduced-motion:reduce){#wktNav,#wktScrim,.wkt-nav-link,.wkt-nav-link svg,.wkt-nav-link span,.wkt-nav-sep,html.wkt-pin body,.wkt-hdr .wkt-tool-btn{transition:none}}`;
    document.head.appendChild(style);

    const ICON = {
        menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
        x: '<path d="M18 6 6 18M6 6l12 12"/>',
        home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
        trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
        star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
        clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
        help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
        pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
        mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    };
    const svg = (p, n = 20) => `<svg viewBox="0 0 24 24" width="${n}" height="${n}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
    // null は区切り線
    const ITEMS = [
        ["/wkt", "ホーム", "home"], ["/wkt/trend", "トレンド", "trend"], ["/wkt/cl/fav", "お気に入り", "star"],
        ["/wkt/cl/history", "閲覧履歴", "clock"], ["/wkt/cl/shistory", "検索履歴", "search"],
        null,
        ["/blog/b/wkthelp", "ヘルプ", "help"], ["/blog/b/stats", "稼働状況", "pulse"], ["/blog/b/form", "お問い合わせ", "mail"],
    ];

    document.addEventListener("DOMContentLoaded", () => {
        const h = document.querySelector("header.wkt-hdr") || document.querySelector("header");
        if (!h) { root.classList.remove("wkt-pin"); return; }

        const nav = document.createElement("nav");
        nav.id = "wktNav";
        nav.setAttribute("aria-label", "メインメニュー");
        nav.tabIndex = -1;
        nav.innerHTML = `<div class="wkt-nav-head"><span>わかめtube Plus</span><button type="button" class="wkt-nav-x" aria-label="メニューを閉じる">${svg(ICON.x)}</button></div>`
            + ITEMS.map(i => i
                ? `<a class="wkt-nav-link" href="${i[0]}" title="${i[1]}"${i[0] === path ? ' aria-current="page"' : ""}>${svg(ICON[i[2]])}<span>${i[1]}</span></a>`
                : '<div class="wkt-nav-sep"></div>').join("");
        const scrim = document.createElement("div");
        scrim.id = "wktScrim";
        document.body.append(scrim, nav);

        // ヘッダーの左の枠に、☰ とサイト名を足す(枠が無いヘッダーなら、作る)
        const btn = document.createElement("button");
        btn.id = "wktMenuBtn";
        btn.type = "button";
        btn.setAttribute("aria-label", "メニュー");
        btn.setAttribute("aria-controls", "wktNav");
        btn.innerHTML = svg(ICON.menu, 24);
        const brand = document.createElement("a");
        brand.className = "wkt-brand";
        brand.href = "/wkt";
        brand.textContent = "わかめtube Plus";
        let slot = h.querySelector(".wkt-hdr-left");
        if (!slot) { slot = document.createElement("div"); slot.className = "wkt-hdr-left"; h.prepend(slot); }
        slot.prepend(btn, brand);

        // 見えていない間は、Tab キーで中に入れないようにする
        const sync = () => {
            const open = root.classList.contains("wkt-open");
            nav.inert = !(open || wide.matches);
            btn.setAttribute("aria-expanded", String(wide.matches ? !root.classList.contains("wkt-mini") : open));
        };
        const close = () => { root.classList.remove("wkt-open"); sync(); btn.focus({ preventScroll: true }); };

        btn.addEventListener("click", () => {
            if (wide.matches) { // 広い画面: 「広い」と「細い帯」の切り替え(覚えておく)
                save(root.classList.toggle("wkt-mini") ? "1" : "0");
                sync();
            } else { // 狭い画面: 上に重ねて出す
                root.classList.toggle("wkt-open");
                sync();
                if (root.classList.contains("wkt-open")) nav.focus({ preventScroll: true }); // 先頭のリンクではなく、メニュー全体にフォーカス(青い枠が出ない)
            }
        });
        scrim.addEventListener("click", close);
        nav.querySelector(".wkt-nav-x").addEventListener("click", close);
        document.addEventListener("keydown", e => { if (e.key === "Escape" && root.classList.contains("wkt-open")) close(); });
        wide.addEventListener("change", () => { root.classList.remove("wkt-open"); sync(); });
        sync();
    });
})();

$(function () {
    $('#searchbox').autocomplete({
        source: function (request, response) {
            let searchTerm = request.term.trim();
            if (searchTerm.length > 0) {
                $.ajax({
                    url: '/wkt/back/suggest',
                    data: { keyword: searchTerm },
                    success: function (data) {
                        response(data.length > 0 ? data : getSearchHistory());
                    }
                });
            } else {
                response(getSearchHistory());
            }
        },
        delay: 1,
        minLength: 0,
        select: function (event, ui) {
            $('#searchbox').val(ui.item.value);
            $('#searchForm')[0].requestSubmit();
        }
    });
    function getSearchHistory() {
        let history = JSON.parse(localStorage.getItem('searchHistory')) || [];
        return history;
    }
    $('#searchbox').on('focus', function () {
        const q = document.getElementById('searchbox').value;
        if(q){
          $(this).autocomplete('search', q);
        }else{
          $(this).autocomplete('search', '');
        }
    });
});

// ===== 動画・チャンネル・再生リストの履歴/お気に入り(動画ページ・チャンネルページ・再生リストページ共通) =====
// localStorage の wakametubehistory / wakametubefavorites に入れる。動画は type なし、チャンネルは "channel"、再生リストは "playlist"。
// 文字はエスケープ済みで保存する(表示側は innerHTML にそのまま入れる)
const WKT_STAR_ON = "https://wsrv.nl/?url=https://kotonohaworks.com/free-icons/wp-content/uploads/kkrn_icon_hoshi_1.png";
const WKT_STAR_OFF = "https://wsrv.nl/?url=https://kotonohaworks.com/free-icons/wp-content/uploads/kkrn_icon_hoshi_4.png";

function wktEsc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function wktList(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; }
}
function wktSame(a, b) {
    const id = e => e.type === "channel" ? e.channelId : e.type === "playlist" ? e.playlistId : e.videoId;
    return a.type === b.type && id(a) === id(b);
}
function wktHas(key, entry) {
    return wktList(key).some(e => wktSame(e, entry));
}
function wktSaveHistory(entry) {
    const list = wktList("wakametubehistory").filter(e => !wktSame(e, entry));
    if (list.length >= 100) list.shift();
    list.push(entry);
    localStorage.setItem("wakametubehistory", JSON.stringify(list));
}
// お気に入りを切り替えて、切り替え後にお気に入りかどうかを返す
function wktToggleFav(entry) {
    const was = wktHas("wakametubefavorites", entry);
    const list = wktList("wakametubefavorites").filter(e => !wktSame(e, entry));
    localStorage.setItem("wakametubefavorites", JSON.stringify(was ? list : [...list, entry]));
    return !was;
}

// お気に入りボタン(data-entry に保存する内容を JSON で持つ)。星でお気に入りを切り替える。
// saveHist が true のボタンだけ、開いたときに履歴へ保存する。
// そのページに showMessage があれば(動画ページ)、切り替えたときに知らせる
function wktBindFav(btn, saveHist) {
    try {
        const entry = JSON.parse(btn.dataset.entry);
        for (const k in entry) entry[k] = k === "type" ? entry[k] : wktEsc(entry[k]);
        const icon = btn.querySelector("img");
        const show = () => { icon.src = wktHas("wakametubefavorites", entry) ? WKT_STAR_ON : WKT_STAR_OFF; };
        if (saveHist) wktSaveHistory(entry);
        show();
        btn.addEventListener("click", () => {
            const now = wktToggleFav(entry);
            show();
            if (typeof showMessage === "function") {
                const name = entry.videoTitle || entry.channelName || entry.title;
                showMessage(`${name}${now ? "を" : "の"}<a href="/wkt/cl/fav" style='color: #60a5fa;'>お気に入り</a>${now ? "に追加" : "を解除"}しました☑️`);
            }
        });
    } catch (e) { console.error(e); }
}

// #wktFavBtn(動画・チャンネル・再生リスト本体のお気に入り。履歴にも保存する)と、
// .wkt-ch-fav(動画ページにあるチャンネルのお気に入り。履歴には保存しない)
$(function () {
    const main = document.getElementById("wktFavBtn");
    if (main) wktBindFav(main, true);
    document.querySelectorAll(".wkt-ch-fav").forEach(b => wktBindFav(b, false));
});
