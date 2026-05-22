import { Router } from 'express';
import { getPdf } from '../../utils/pdf-store.js';

const router = Router();

router.get('/:token', (req, res) => {
  const entry = getPdf(req.params.token);
  if (!entry) { res.status(404).json({ error: 'PDF not found or expired' }); return; }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${entry.filename}"`);
  res.setHeader('Content-Length', String(entry.buffer.length));
  res.end(entry.buffer);
});

export default router;
