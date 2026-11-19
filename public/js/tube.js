// ===== 共通ヘッダー(検索欄つき) =====
// 使い方: ページの header タグ一式の代わりに、同じ場所へ script タグを1つ置き、中身を wktHeader() だけにする
//   検索語があるページは、そのタグに属性 data-q を付けて、ejs の検索語(<%= ... %>)を入れる
//   動画ページは、属性 data-tool を付ける(「ツール」ボタンが付き、ヘッダーはページと一緒に流れる)
// 検索語は ejs が HTML エスケープして属性に入れるので、script の中身には書かない(書くと危ない)
window.wktHeader = function () {
    const s = document.currentScript;
    if (!s) return;
    const tool = s.hasAttribute("data-tool");
    s.insertAdjacentHTML("beforebegin", `<header class="bg-gray-800 p-4 flex justify-between items-center${tool ? "" : " fixed top-0 left-0 w-full z-10"}">
        <form action="/wkt/s" method="get" class="w-1/2 relative" id="searchForm">
            <input type="text" name="q" id="searchbox" placeholder="検索" aria-label="検索" class="searchbox w-full p-2 pr-10 rounded bg-gray-700 text-white">
            <button type="button" id="clearBtn" aria-label="検索欄を消す" class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded-full hover:bg-gray-400 text-white text-lg leading-none hidden">×</button>
        </form>${tool ? `
        <button id="toggleToolbar" class="toggle-btn w-1/5">ツール</button>` : ""}
    </header>`);
    const box = document.getElementById("searchbox"), clear = document.getElementById("clearBtn");
    box.value = s.dataset.q || "";
    const sync = () => { clear.style.display = box.value ? "block" : "none"; };
    box.addEventListener("input", sync);
    clear.addEventListener("click", () => { box.value = ""; box.focus(); sync(); });
    sync();
};

// ===== 左サイドバー(ヘッダーに ☰ を足して、ホーム・トレンド・履歴などを出す) =====
// jQuery に頼らない。ヘッダーの作り(header や、header 内のリンク)を見つけて差し込むので、ヘッダーを作り替えたらここも見直す(ponytail)
(function () {
    const root = document.documentElement;
    const path = location.pathname.replace(/\/+$/, "") || "/";
    // 広い画面では、どのページでも開きっぱなしにできる。動画ページだけは、動画の幅を守るため、基準を少し広め(1280px)にする
    const pinMin = /^\/wkt\/(watch|w|yt)(\/|$)/.test(path) ? 1280 : 1024;
    const KEY = "wktNavPinned"; // "0" なら、広い画面でも閉じておく
    const stored = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
    const wide = matchMedia(`(min-width:${pinMin}px)`);
    // 本文が描画される前に余白を空けて、がたつきを防ぐ(余白は CSS の min-width で広い画面だけ効く)
    if (stored() !== "0") root.classList.add("wkt-pin");

    const style = document.createElement("style");
    style.textContent = `
#wktMenuBtn{position:absolute;left:.25rem;top:50%;transform:translateY(-50%);width:2.75rem;height:2.75rem;display:flex;align-items:center;justify-content:center;border:0;border-radius:.5rem;background:none;color:#d1d5db;cursor:pointer;padding:0}
#wktMenuBtn:hover,.wkt-nav-x:hover{background:#374151;color:#fff}
#wktNav{position:fixed;left:0;top:0;bottom:0;width:min(80vw,15rem);box-sizing:border-box;z-index:60;background:#1f2937;border-right:1px solid #374151;padding:.5rem;overflow-y:auto;overscroll-behavior:contain;transform:translateX(-100%);transition:transform .2s ease;word-break:normal}
#wktScrim{display:none;position:fixed;inset:0;z-index:59;background:rgba(0,0,0,.6)}
html.wkt-open #wktNav{transform:none}
html.wkt-open #wktScrim{display:block}
html.wkt-open{overflow:hidden}
.wkt-nav-head{display:flex;align-items:center;justify-content:space-between;padding-left:.75rem;color:#fff;font-weight:600}
.wkt-nav-x{width:2.75rem;height:2.75rem;display:flex;align-items:center;justify-content:center;border:0;border-radius:.5rem;background:none;color:#d1d5db;cursor:pointer;padding:0}
.wkt-nav-link{display:flex;align-items:center;gap:.75rem;min-height:2.75rem;padding:0 .75rem;border-radius:.5rem;color:#d1d5db;text-decoration:none;font-size:.95rem}
.wkt-nav-link:hover{background:#374151;color:#fff}
.wkt-nav-link[aria-current=page]{background:#374151;color:#fff;box-shadow:inset 3px 0 0 #3b82f6}
.wkt-nav-sep{height:1px;background:#374151;margin:.5rem .75rem}
#wktNav a:focus-visible,#wktNav button:focus-visible,#wktMenuBtn:focus-visible{outline:2px solid #60a5fa;outline-offset:-2px}
@media (min-width:${pinMin}px){
  html.wkt-pin body{padding-left:15rem}
  html.wkt-pin header.fixed{left:15rem;width:calc(100% - 15rem)}
  html.wkt-pin #wktNav{transform:none;transition:none;width:15rem;z-index:20}
}
#wktNav:focus{outline:none}
@media (prefers-reduced-motion:reduce){#wktNav{transition:none}}`;
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
        const h = document.querySelector("header.fixed") || document.querySelector("header");
        if (!h) { root.classList.remove("wkt-pin"); return; }

        const nav = document.createElement("nav");
        nav.id = "wktNav";
        nav.setAttribute("aria-label", "メインメニュー");
        nav.tabIndex = -1;
        nav.innerHTML = `<div class="wkt-nav-head"><span>わかめtube Plus</span><button type="button" class="wkt-nav-x" aria-label="メニューを閉じる">${svg(ICON.x)}</button></div>`
            + ITEMS.map(i => i
                ? `<a class="wkt-nav-link" href="${i[0]}"${i[0] === path ? ' aria-current="page"' : ""}>${svg(ICON[i[2]])}<span>${i[1]}</span></a>`
                : '<div class="wkt-nav-sep"></div>').join("");
        const scrim = document.createElement("div");
        scrim.id = "wktScrim";
        document.body.append(scrim, nav);

        const btn = document.createElement("button");
        btn.id = "wktMenuBtn";
        btn.type = "button";
        btn.setAttribute("aria-label", "メニュー");
        btn.setAttribute("aria-controls", "wktNav");
        btn.innerHTML = svg(ICON.menu, 24);
        h.prepend(btn);
        h.style.paddingLeft = "3.5rem"; // ☰ の分だけ、ヘッダーの中身を右にずらす
        if (!h.classList.contains("fixed")) h.style.position = "relative";

        // ヘッダーにあった文字リンクのうち、サイドバーと同じものは隠す
        const hrefs = ITEMS.filter(Boolean).map(i => i[0]);
        h.querySelectorAll("a").forEach(a => { if (hrefs.includes(a.getAttribute("href"))) a.style.display = "none"; });

        // 見えていない間は、Tab キーで中に入れないようにする
        const sync = () => {
            const shown = root.classList.contains("wkt-open") || (wide.matches && root.classList.contains("wkt-pin"));
            nav.inert = !shown;
            btn.setAttribute("aria-expanded", String(shown));
        };
        const close = () => { root.classList.remove("wkt-open"); sync(); btn.focus({ preventScroll: true }); };
        const save = v => { try { localStorage.setItem(KEY, v); } catch (e) {} };

        btn.addEventListener("click", () => {
            if (wide.matches) { // 広い画面: 開きっぱなしの入/切(覚えておく)
                save(root.classList.toggle("wkt-pin") ? "1" : "0");
                sync();
            } else { // 狭い画面: 上に重ねて出す
                root.classList.toggle("wkt-open");
                sync();
                if (root.classList.contains("wkt-open")) nav.focus({ preventScroll: true }); // 先頭のリンクではなく、メニュー全体にフォーカス(青い枠が出ない)
            }
        });
        scrim.addEventListener("click", close);
        nav.querySelector(".wkt-nav-x").addEventListener("click", () => {
            if (root.classList.contains("wkt-pin") && wide.matches) { root.classList.remove("wkt-pin"); save("0"); sync(); } // 開きっぱなしのとき: 閉じて覚える
            else close();
        });
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
