const express = require('express');
const Joi = require('joi');
const asyncHandler = require('../utils/async-handler');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const authService = require('../services/auth.service');

const router = express.Router();

const signupSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(150).required(),
  email: Joi.string().trim().email().allow('', null),
  phoneNumber: Joi.string().trim().max(30).allow('', null),
  password: Joi.string().min(6).max(100).required(),
  businessName: Joi.string().trim().min(2).max(200).required(),
  businessType: Joi.string().trim().max(100).allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
});

const loginSchema = Joi.object({
  emailOrPhone: Joi.string().trim().required(),
  password: Joi.string().required(),
});

router.post('/signup', validate(signupSchema), asyncHandler(async (req, res) => {
  const result = await authService.signup(req.body);
  res.status(201).json({ success: true, ...result });
}));

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  res.json({ success: true, ...result });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ success: true, user: authService.safeUser(req.user) });
}));

router.get('/businesses', requireAuth, asyncHandler(async (req, res) => {
  const businesses = await authService.listBusinesses(req.user.user_id);
  res.json({ success: true, data: businesses });
}));

module.exports = router;
