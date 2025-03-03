document.getElementById("toggleComments").addEventListener("click", function() {
            document.getElementById("commentBox").classList.toggle("open");
        });
        document.getElementById("closeComments").addEventListener("click", function() {
            document.getElementById("commentBox").classList.remove("open");
        });
        document.getElementById("closeComments2").addEventListener("click", function() {
            document.getElementById("commentBox").classList.remove("open");
        });
        document.getElementById("toggledouga").addEventListener("click", function() {
            document.getElementById("dougaBox").classList.toggle("open");
        });
        document.getElementById("closedouga").addEventListener("click", function() {
            document.getElementById("dougaBox").classList.remove("open");
});

async function fetchComments() {
    const commentContainers = [document.getElementById("commentsList1"), document.getElementById("commentsList2")];
    const errorContainers = [document.getElementById("commentError1"), document.getElementById("commentError2")];
    const retryButton = document.getElementById("retryButton");

    commentContainers.forEach(container => container.innerHTML = "<p>コメントを取得中...</p>");
    errorContainers.forEach(error => error.style.display = "none");
    retryButton.style.display = "none";

    try {
        const response = await fetch("/wkt/back/comment/<%= videoData.videoId %>");
        if (!response.ok) throw new Error("サーバーエラー");

        const responseText = await response.text();

        commentContainers.forEach(container => {
            container.innerHTML = responseText;
        });
    } catch (error) {
        console.error("エラー:", error);
        errorContainers.forEach(errorContainer => {
            errorContainer.textContent = "コメントの取得に失敗しました: " + error.message;
            errorContainer.style.display = "block";
        });
        retryButton.style.display = "block";
    }
}

document.getElementById("retryButton").addEventListener("click", fetchComments);

fetchComments();

const videoId = "<%= videoData.videoId %>";
const channelId = "<%= videoData.channelId %>";
const channelName = "<%= videoData.channelName %>";
const videoTitle = "<%= videoData.videoTitle %>";


function saveToHistory(videoId, channelId, channelName, videoTitle) {
    let history = getHistoryFromCookies();

    const historyIndex = history.findIndex(track => track.videoId === videoId);

    if (historyIndex !== -1) {
        history.splice(historyIndex, 1);
    }

    if (history.length >= 10) {
        history.shift();
    }

    history.push({ videoId, channelId, channelName, videoTitle });

    document.cookie = `wakametubehistory=${encodeURIComponent(JSON.stringify(history))}; path=/; max-age=31536000`;
}

function getHistoryFromCookies() {
    const historyCookie = document.cookie.split('; ').find(row => row.startsWith('wakametubehistory='));
    if (historyCookie) {
        const cookieValue = historyCookie.split('=')[1];
        try {
            return JSON.parse(decodeURIComponent(cookieValue));
        } catch (error) {
            console.error('Error parsing history cookie:', error);
            return [];
        }
    }
    return [];
}

document.addEventListener('DOMContentLoaded', () => {
    saveToHistory(videoId, channelId, channelName, videoTitle);
});

function toggleDescription(button) {
    const description = button.closest('div').nextElementSibling;

    if (description.classList.contains('hidden')) {
        description.classList.remove('hidden');
        button.textContent = '折りたたむ';
    } else {
        description.classList.add('hidden');
        button.textContent = '表示する';
    }
}