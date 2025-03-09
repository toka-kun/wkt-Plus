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
            $('#searchForm').submit();
        }
    });
});