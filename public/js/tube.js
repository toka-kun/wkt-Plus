$(function () {
    $('#searchbox').autocomplete({
        source: function (request, response) {
            $.ajax({
                url: '/wkt/back/suggest',
                data: { keyword: request.term },
                success: function (data) {
                    response(data);
                }
            });
        },
        delay: 1,
        select: function (event, ui) {
            $('#searchbox').val(ui.item.value);
            $('form').submit();
        }
    });
});

document.addEventListener('DOMContentLoaded', function () {
    const clickableElements = document.querySelectorAll('.clickable');

    clickableElements.forEach(function (element) {
        element.addEventListener('click', function () {
            const overlay = element.querySelector('::after'); // HTML内の::afterにはJavaScriptからアクセスできないため、クラスを利用して制御します。
            if (overlay) {
                overlay.style.opacity = '1';
                setTimeout(function () {
                    overlay.style.opacity = '0'; // 一定時間後にオーバーレイを非表示
                }, 200);
            }
        });
    });
});