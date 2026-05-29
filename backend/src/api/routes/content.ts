import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import {
  getLatestPendingVideo,
  approveVideo,
  rejectVideo,
} from '../../marketing/approval-store.js';
import { env } from '../../config/env.js';

const router = Router();

// GET /api/content/status — TikTok pending + WhatsApp config status
router.get('/status', requireMobileAuth, (_req, res) => {
  const pending = getLatestPendingVideo();
  const whatsappConfigured = Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);
  const tiktokConfigured = Boolean(env.TIKTOK_ACCESS_TOKEN && env.TIKTOK_OPEN_ID);

  res.json({
    tiktok: {
      configured: tiktokConfigured,
      pendingVideo: pending ? {
        id:       pending.id,
        title:    pending.car_name,
        caption:  pending.caption,
        script:   pending.script.slice(0, 200),
        hashtags: pending.hashtags.slice(0, 5),
        videoUrl: pending.video_url,
        createdAt: pending.created_at,
      } : null,
    },
    whatsapp: {
      configured: whatsappConfigured,
      phoneId: whatsappConfigured ? env.WHATSAPP_PHONE_ID : null,
    },
  });
});

// POST /api/content/tiktok/:id/approve
router.post('/tiktok/:id/approve', requireMobileAuth, (req, res) => {
  const { id } = req.params as { id: string };
  const video = approveVideo(id);
  if (!video) { res.status(404).json({ error: 'Video not found or already processed' }); return; }
  console.log(`[content] TikTok video ${id} approved via mobile by ${req.mobileActor?.displayName}`);
  res.json({ ok: true, video: video.car_name });
});

// POST /api/content/tiktok/:id/reject
router.post('/tiktok/:id/reject', requireMobileAuth, (req, res) => {
  const { id } = req.params as { id: string };
  rejectVideo(id);
  console.log(`[content] TikTok video ${id} rejected via mobile by ${req.mobileActor?.displayName}`);
  res.json({ ok: true });
});

export default router;
