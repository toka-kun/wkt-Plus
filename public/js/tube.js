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

document.getElementById("searchForm").addEventListener("submit", function(event) {
    event.preventDefault();
    const query = document.getElementById("searchbox").value.trim();
    const ytRegex = /(?:https?:\/\/)?(?:www\.)?youtu(?:\.be\/|be\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w\-]+)/;
    const match = query.match(ytRegex);
    if (match) {
        const videoId = match[1];
        window.location.href = `/wkt/w/${videoId}`;
    } else {
        this.submit();
    }
});