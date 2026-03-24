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
// === シークレットモード（全自動about:blank監視システム） ===
// ==========================================

function openUrlInAboutBlank(targetUrl, isOriginalTab = false) {
    const win = window.open('about:blank', '_blank');
    if (!win) {
        if (typeof showMessage === 'function') {
            showMessage('⚠️ ポップアップがブロックされました。ブラウザの設定から許可してください。');
        } else {
            alert('⚠️ ポップアップがブロックされました。ブラウザの設定から許可してください。');
        }
        return null;
    }

    // about:blankの親画面（外枠）に仕込む「監視用スクリプト」
    // 中に表示されるページがいちいちコードを書かなくても、外枠から自動で横取り機能を注入します
    const wrapperScript = `
        // 子画面（iframe）から「新しいタブを開いて」と頼まれたら、またabout:blankを作る関数
        function createNewBlank(url) {
            const newWin = window.open('about:blank', '_blank');
            if(!newWin) return;
            
            // 今の外枠のHTMLとこの監視スクリプトをそのままコピーして、新しいタブに引き継ぐ
            const currentScript = document.querySelector('script').textContent;
            const newHtml = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>about:blank</title><style>body, html { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background-color: #1a202c; } iframe { width: 100%; height: 100%; border: none; }</style></head><body><iframe src="' + url + '" allowfullscreen></iframe><scr' + 'ipt>' + currentScript + '</scr' + 'ipt></body></html>';
            
            newWin.document.open();
            newWin.document.write(newHtml);
            newWin.document.close();
        }

        // iframeからの依頼を受け取るリスナー
        window.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'OPEN_BLANK') {
                createNewBlank(e.data.url);
            }
        });

        // iframeの中のページが切り替わるたびに、外側から自動で横取り機能をセットする
        const iframe = document.querySelector('iframe');
        iframe.addEventListener('load', () => {
            try {
                const iDoc = iframe.contentWindow.document;
                const iWin = iframe.contentWindow;
                
                // 1. aタグ(target="_blank")の横取り
                iDoc.addEventListener('click', (e) => {
                    const link = e.target.closest('a');
                    if (link && link.target === '_blank') {
                        e.preventDefault();
                        // 親画面（この外枠）に「新しいタブを開いて」とお願いする
                        window.parent.postMessage({ type: 'OPEN_BLANK', url: link.href }, '*');
                    }
                });

                // 2. window.openの横取り
                const origOpen = iWin.open;
                iWin.open = function(url, target, features) {
                    if (target === '_blank' || !target) {
                        window.parent.postMessage({ type: 'OPEN_BLANK', url: url }, '*');
                        return null;
                    }
                    return origOpen.call(iWin, url, target, features);
                };
            } catch(err) {
                // 外部サイト（別ドメインのサイトなど）に飛んだ場合は監視できないため通常通りにさせる
            }
        });
    `;

    const iframeHtml = `
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <title>about:blank</title>
            <style>
                body, html { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background-color: #1a202c; }
                iframe { width: 100%; height: 100%; border: none; }
            </style>
        </head>
        <body>
            <iframe src="${targetUrl}" allowfullscreen></iframe>
            <script>${wrapperScript}</script>
        </body>
        </html>
    `;

    win.document.open();
    win.document.write(iframeHtml);
    win.document.close();

    // 最初のタブだけGoogleに飛ばす
    if (isOriginalTab) {
        window.location.replace('https://www.google.com');
    }
    return win;
}
