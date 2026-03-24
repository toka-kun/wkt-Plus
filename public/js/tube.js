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

// ==========================================
// === シークレットモード（about:blank）共通処理 ===
// ==========================================

// 元の window.open をバックアップしておく（無限ループ防止のため）
const originalWindowOpen = window.open;

function openUrlInAboutBlank(targetUrl, isOriginalTab = false) {
    // 上書きされたものではなく、バックアップしておいた元の window.open を使う
    const win = originalWindowOpen.call(window, 'about:blank', '_blank');

    if (!win || win.closed || typeof win.closed == 'undefined') {
        if (typeof showMessage === 'function') {
            showMessage('⚠️ ポップアップがブロックされました。ブラウザの設定から許可してください。');
        } else {
            alert('⚠️ ポップアップがブロックされました。ブラウザの設定から許可してください。');
        }
        return null;
    }

    const iframeHtml = `
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <title>about:blank</title>
            <style>
                body, html {
                    margin: 0; padding: 0; width: 100vw; height: 100vh;
                    overflow: hidden; background-color: #1a202c;
                }
                iframe {
                    width: 100%; height: 100%; border: none;
                }
            </style>
        </head>
        <body>
            <iframe src="${targetUrl}" allowfullscreen></iframe>
        </body>
        </html>
    `;

    win.document.open();
    win.document.write(iframeHtml);
    win.document.close();
    
    // 大元のタブ（ボタンを押したタブ）のみGoogleへリダイレクト
    if (isOriginalTab) {
        window.location.replace('https://www.google.com');
    }
    return win;
}

// === about:blank内部での処理（別のタブを開く動作を横取りする） ===
// 自分がiframe（about:blank）の中にいる場合のみ、横取りシステムを起動
if (window !== window.parent) {
    
    // (A) target="_blank" の <a> タグ（リンク）のクリックを横取り
    document.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (link && link.target === '_blank') {
            e.preventDefault(); 
            openUrlInAboutBlank(link.href, false);
        }
    });

    // (B) JavaScriptの window.open() 自体を上書きして横取り
    window.open = function(url, target, features) {
        if (target === '_blank' || !target) {
            return openUrlInAboutBlank(url, false);
        }
        return originalWindowOpen.call(window, url, target, features);
    };
}
