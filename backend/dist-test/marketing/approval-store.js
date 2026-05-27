"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePendingVideo = savePendingVideo;
exports.getLatestPendingVideo = getLatestPendingVideo;
exports.getPendingVideoById = getPendingVideoById;
exports.approveVideo = approveVideo;
exports.rejectVideo = rejectVideo;
const supabase_js_1 = require("../integrations/supabase.js");
const store = new Map();
let latestId = null;
async function savePendingVideo(video) {
    const id = `vid_${Date.now()}`;
    const pending = {
        ...video,
        id,
        created_at: new Date().toISOString(),
        status: 'pending',
    };
    store.set(id, pending);
    latestId = id;
    try {
        await supabase_js_1.supabase.from('tasks').insert({
            title: `Marketing Video: ${video.car_name}`,
            action_type: 'marketing_video_approval',
            payload: pending,
            status: 'pending',
            completed_at: null,
        });
    }
    catch (_) {
        // table tasks may not exist — ignore
    }
    return id;
}
function getLatestPendingVideo() {
    if (!latestId)
        return null;
    const v = store.get(latestId);
    return v?.status === 'pending' ? v : null;
}
function getPendingVideoById(id) {
    return store.get(id) ?? null;
}
function approveVideo(id) {
    const v = store.get(id);
    if (!v)
        return null;
    v.status = 'approved';
    if (latestId === id)
        latestId = null;
    void supabase_js_1.supabase.from('tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('payload->>id', id)
        .then(() => { });
    return v;
}
function rejectVideo(id) {
    const v = store.get(id);
    if (!v)
        return;
    v.status = 'rejected';
    if (latestId === id)
        latestId = null;
    void supabase_js_1.supabase.from('tasks')
        .update({ status: 'cancelled' })
        .eq('payload->>id', id)
        .then(() => { });
}
//# sourceMappingURL=approval-store.js.map