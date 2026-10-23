import { Router } from 'express';
import * as pub from '../controllers/public.controller.js';
import * as admin from '../controllers/admin.controller.js';
import {
  validate, validObjectId, requireDb, requireStaff, requirePermission, csrfGuard, sanitizeBody, limits,
} from '../middleware/index.js';
import * as v from '../validators/index.js';
import { registrationSchema, statusLookupSchema } from '../../../shared/schemas.js';
import { registrationUpload } from '../services/documents.js';

const id = validObjectId('id');

// ---------- Public ----------
export const publicRouter = Router();
publicRouter.get('/health', pub.health);
publicRouter.get('/config', pub.publicConfig);
publicRouter.get('/locations/wards', validate(v.wardQuerySchema, 'query'), pub.listWards);
publicRouter.get('/locations/polling-units', validate(v.pollingUnitQuerySchema, 'query'), pub.listPollingUnits);
publicRouter.post(
  '/agents/register',
  limits.register,
  requireDb, // fail before reading uploads when nothing could be saved
  registrationUpload,
  pub.parseRegistrationData,
  sanitizeBody,
  validate(registrationSchema),
  pub.register,
);
publicRouter.post('/agents/status', limits.lookup, validate(statusLookupSchema), requireDb, pub.checkStatus);

// ---------- Admin ----------
export const adminRouter = Router();
adminRouter.use(csrfGuard, requireDb);
adminRouter.post('/auth/login', limits.login, validate(v.loginSchema), admin.login);
adminRouter.post('/auth/logout', admin.logout);

adminRouter.use(requireStaff);
const can = requirePermission;
adminRouter.get('/auth/me', admin.me);
adminRouter.get('/dashboard', can('agents:read'), admin.dashboard);

adminRouter.get('/agents', can('agents:read'), validate(v.agentQuerySchema, 'query'), admin.listAgents);
adminRouter.get('/exports/agents', can('agents:export'), validate(v.agentQuerySchema, 'query'), admin.exportAgents);
adminRouter.get('/agents/:id', id, can('agents:read'), admin.getAgent);
adminRouter.post('/agents/:id/sensitive-details', id, can('agents:sensitive:read'), admin.revealSensitiveDetails);
adminRouter.get('/agents/:id/documents/:kind', id, can('documents:read'), admin.getAgentDocument);
adminRouter.patch('/agents/:id/status', id, can('agents:review'), validate(v.statusChangeSchema), admin.updateAgentStatus);
adminRouter.post('/agents/:id/notes', id, can('agents:review'), validate(v.noteSchema), admin.addAgentNote);
adminRouter.delete('/agents/:id', id, can('agents:delete'), validate(v.deleteAgentSchema), admin.deleteAgent);

adminRouter.get('/email/status', can('agents:read'), admin.emailStatus);
adminRouter.post('/email/drain', can('agents:review'), admin.emailDrain);

adminRouter.get('/audit', can('audit:read'), validate(v.pageQuerySchema, 'query'), admin.listAudit);

adminRouter.get('/staff', can('staff:manage'), admin.listStaff);
adminRouter.post('/staff', can('staff:manage'), validate(v.staffCreateSchema), admin.createStaff);
adminRouter.patch('/staff/:id', id, can('staff:manage'), validate(v.staffUpdateSchema), admin.updateStaff);
