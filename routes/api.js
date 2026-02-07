const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

// Multer Config for Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// Controllers
const authController = require('../controllers/authController');
const policyController = require('../controllers/policyController');
const claimController = require('../controllers/claimController');
const { verifyToken, isAdminOrEmployee } = require('../middleware/authMiddleware');

// Auth Routes
router.post('/register', authController.register); // Also used by Admin to add Employees
router.post('/login', authController.login);

// Policy Routes
router.post('/policies', verifyToken, policyController.createPolicy); // Client creates own, or Staff creates
router.get('/policies', verifyToken, policyController.getPolicies); // View status
router.get('/policies/:id', verifyToken, policyController.getPolicyDetails); // View details for claim
router.post('/reminders', verifyToken, isAdminOrEmployee, policyController.sendPaymentReminders);

// Claim Routes (Uploads allowed)
router.post('/claims', verifyToken, upload.array('documents', 5), claimController.submitClaim);

module.exports = router;