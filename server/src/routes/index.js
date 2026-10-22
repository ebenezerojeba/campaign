import { Router } from 'express';
import * as pub from '../controllers/public.controller.js';
import * as admin from '../controllers/admin.controller.js';
import * as portal from '../controllers/portal.controller.js';
import {
  validate, validObjectId, requireDb, requireStaff, requirePermission, requireVolunteer, csrfGuard, limits,
} from '../middleware/index.js';
import * as v from '../validators/index.js';
import { registrationSchema, statusLookupSchema } from '../../../shared/schemas.js';
import { imageUpload, uploadImage } from '../services/uploads.js';
import { ApiError, send } from '../utils/ApiError.js';
import { audit } from '../services/audit.js';

const id = validObjectId('id');

// ---------- Public ----------
export const publicRouter = Router();
publicRouter.get('/health', pub.health);
publicRouter.get('/config', pub.publicConfig);
publicRouter.get('/stats', requireDb, pub.publicStats);
publicRouter.get('/opportunities', requireDb, validate(v.publicOpportunityQuerySchema, 'query'), pub.listOpportunities);
publicRouter.get('/opportunities/:id', id, requireDb, pub.getOpportunity);
publicRouter.post('/volunteers/register', limits.register, validate(registrationSchema), requireDb, pub.register);
publicRouter.post('/volunteers/status', limits.lookup, validate(statusLookupSchema), requireDb, pub.checkStatus);

// ---------- Volunteer portal ----------
export const portalRouter = Router();
portalRouter.use(csrfGuard, requireDb);
portalRouter.post('/auth/request-code', limits.code, validate(v.requestCodeSchema), portal.requestCode);
portalRouter.post('/auth/verify', limits.login, validate(v.verifyCodeSchema), portal.verifyCode);
portalRouter.post('/auth/logout', portal.logout);
portalRouter.use(requireVolunteer);
portalRouter.get('/me', portal.me);
portalRouter.patch('/me', validate(v.portalUpdateSchema), portal.updateMe);
portalRouter.get('/me/export', portal.exportMine);
portalRouter.get('/announcements', portal.announcements);
portalRouter.get('/opportunities', portal.opportunities);
portalRouter.post('/opportunities/:id/interest', id, portal.toggleInterest);
portalRouter.get('/requests', portal.listRequests);
portalRouter.post('/requests', validate(v.dataRequestSchema), portal.createRequest);

// ---------- Admin ----------
export const adminRouter = Router();
adminRouter.use(csrfGuard, requireDb);
adminRouter.post('/auth/login', limits.login, validate(v.loginSchema), admin.login);
adminRouter.post('/auth/logout', admin.logout);

adminRouter.use(requireStaff);
const can = requirePermission;
adminRouter.get('/auth/me', admin.me);
adminRouter.get('/dashboard', can('volunteers:read'), admin.dashboard);

adminRouter.get('/volunteers', can('volunteers:read'), validate(v.volunteerQuerySchema, 'query'), admin.listVolunteers);
adminRouter.get('/exports/volunteers', can('volunteers:export'), validate(v.volunteerQuerySchema, 'query'), admin.exportVolunteers);
adminRouter.get('/volunteers/:id', id, can('volunteers:read'), admin.getVolunteer);
adminRouter.patch('/volunteers/:id/status', id, can('volunteers:review'), validate(v.statusChangeSchema), admin.updateVolunteerStatus);
adminRouter.post('/volunteers/:id/notes', id, can('volunteers:review'), validate(v.noteSchema), admin.addVolunteerNote);
adminRouter.put('/volunteers/:id/assignments', id, can('opportunities:manage'), validate(v.assignmentSchema), admin.setAssignment);

adminRouter.get('/opportunities', can('volunteers:read'), validate(v.opportunityQuerySchema, 'query'), admin.listAdminOpportunities);
adminRouter.get('/opportunities/:id', id, can('volunteers:read'), admin.getAdminOpportunity);
adminRouter.post('/opportunities', can('opportunities:manage'), validate(v.opportunityCreateSchema), admin.createOpportunity);
adminRouter.patch('/opportunities/:id', id, can('opportunities:manage'), validate(v.opportunityUpdateSchema), admin.updateOpportunity);
adminRouter.delete('/opportunities/:id', id, can('opportunities:manage'), admin.archiveOpportunity);
adminRouter.post('/uploads/image', can('opportunities:manage'), imageUpload, async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Choose an image to upload');
  const image = await uploadImage(req.file.buffer);
  await audit(req, { action: 'upload.image', targetType: 'Image', targetId: image.publicId, summary: 'Uploaded an image' });
  send(res, image, undefined, 201);
});

adminRouter.get('/announcements', can('announcements:manage'), admin.listAnnouncements);
adminRouter.post('/announcements', can('announcements:manage'), validate(v.announcementSchema), admin.createAnnouncement);
adminRouter.patch('/announcements/:id', id, can('announcements:manage'), validate(v.announcementSchema.partial()), admin.updateAnnouncement);

adminRouter.get('/audit', can('audit:read'), validate(v.pageQuerySchema, 'query'), admin.listAudit);
adminRouter.get('/requests', can('requests:manage'), admin.listDataRequests);
adminRouter.patch('/requests/:id', id, can('requests:manage'), validate(v.resolveRequestSchema), admin.resolveDataRequest);

adminRouter.get('/staff', can('staff:manage'), admin.listStaff);
adminRouter.post('/staff', can('staff:manage'), validate(v.staffCreateSchema), admin.createStaff);
adminRouter.patch('/staff/:id', id, can('staff:manage'), validate(v.staffUpdateSchema), admin.updateStaff);
