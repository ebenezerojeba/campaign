import { AuditLog } from '../models/misc.js';

// Records a sensitive administrative action. Never throws: an audit write
// failure is logged loudly but does not undo the action already taken.
export async function audit(req, { action, targetType, targetId, summary, meta }) {
  try {
    await AuditLog.create({
      actor: req.user?._id,
      actorName: req.user?.name,
      actorRole: req.user?.role,
      action,
      targetType,
      targetId: targetId ? String(targetId) : undefined,
      summary,
      meta,
      ip: req.ip,
    });
  } catch (err) {
    console.error('[audit] failed to record', action, err.message);
  }
}
