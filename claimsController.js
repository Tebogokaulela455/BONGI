const db = require('../config/db');

exports.submitClaim = async (req, res) => {
    const { policy_id, reason } = req.body;
    // req.files contains the uploaded files
    
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Please upload death certificate and documents.' });
        }

        // Store file paths as a JSON string or comma-separated string
        const filePaths = req.files.map(file => file.path).join(',');

        await db.execute(
            'INSERT INTO claims (policy_id, reason, document_path, status) VALUES (?, ?, ?, ?)',
            [policy_id, reason, filePaths, 'pending']
        );

        res.status(201).json({ message: 'Claim submitted successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};