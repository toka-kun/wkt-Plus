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
            $('#searchForm').submit();
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

// #wktFavBtn(data-entry に保存する内容を JSON で持つ)があるページは、開いたときに履歴へ保存し、星でお気に入りを切り替える。
// そのページに showMessage があれば(動画ページ)、切り替えたときに知らせる
$(function () {
    const btn = document.getElementById("wktFavBtn");
    if (!btn) return;
    try {
        const entry = JSON.parse(btn.dataset.entry);
        for (const k in entry) entry[k] = k === "type" ? entry[k] : wktEsc(entry[k]);
        const icon = btn.querySelector("img");
        const show = () => { icon.src = wktHas("wakametubefavorites", entry) ? WKT_STAR_ON : WKT_STAR_OFF; };
        wktSaveHistory(entry);
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
});
