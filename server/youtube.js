const { Innertube } = require('youtubei.js');

async function getVideoInfo(videoId) {
    const yt = await Innertube.create();
    const video = await yt.getInfo(videoId);

    return {
        title: video.basic_info.title,
        author: video.basic_info.author,
        views: video.basic_info.view_count,
        likes: video.basic_info.likes,
        description: video.basic_info.short_description,
        thumbnails: video.basic_info.thumbnail,
        uploadDate: video.basic_info.publish_date,
        duration: video.basic_info.duration,
    };
}

module.exports = { getVideoInfo };