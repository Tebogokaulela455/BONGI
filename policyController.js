const db = require('../config/db');
const { sendSMS } = require('../services/smsService');

// Helper to generate unique Policy Number (e.g., POL-20231010-XYZ)
const generatePolicyNumber = () => {
    return 'POL-' + Date.now().toString().slice(-6) + Math.floor(1000 + Math.random() * 9000);
};

exports.createPolicy = async (req, res) => {
    const { policy_type, premium_amount, start_date, beneficiaries } = req.body;
    const userId = req.user.id; // From JWT
    const policyNumber = generatePolicyNumber();

    try {
        // 1. Create Policy
        const [result] = await db.execute(
            'INSERT INTO policies (policy_number, user_id, policy_type, premium_amount, start_date, status) VALUES (?, ?, ?, ?, ?, ?)',
            [policyNumber, userId, policy_type, premium_amount, start_date, 'active']
        );
        const policyId = result.insertId;

        // 2. Add Beneficiaries (Loop if array)
        if (beneficiaries && beneficiaries.length > 0) {
            for (let b of beneficiaries) {
                await db.execute(
                    'INSERT INTO beneficiaries (policy_id, name, relation, id_number) VALUES (?, ?, ?, ?)',
                    [policyId, b.name, b.relation, b.id_number]
                );
            }
        }

        // 3. Get User Phone for SMS
        const [users] = await db.execute('SELECT phone, name FROM users WHERE id = ?', [userId]);
        if (users.length > 0) {
            const msg = `Hello ${users[0].name}, your ${policy_type} policy (No: ${policyNumber}) has been created successfully. Welcome to BONGI TRADE.`;
            await sendSMS(users[0].phone, msg);
        }

        res.status(201).json({ message: 'Policy created successfully', policyNumber });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getPolicies = async (req, res) => {
    try {
        let query = 'SELECT * FROM policies';
        let params = [];

        // If client, only see own policies. If Admin/Employee, see all.
        if (req.user.role === 'client') {
            query += ' WHERE user_id = ?';
            params.push(req.user.id);
        }

        const [policies] = await db.execute(query, params);
        res.status(200).json(policies);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getPolicyDetails = async (req, res) => {
    const { id } = req.params;
    try {
        const [policy] = await db.execute('SELECT * FROM policies WHERE id = ?', [id]);
        const [beneficiaries] = await db.execute('SELECT * FROM beneficiaries WHERE policy_id = ?', [id]);
        
        res.status(200).json({ policy: policy[0], beneficiaries });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Feature: Remind unpaid clients
exports.sendPaymentReminders = async (req, res) => {
    try {
        // Find policies active but past due date (Mock logic)
        const [policies] = await db.execute(`
            SELECT p.policy_number, p.premium_amount, u.phone, u.name 
            FROM policies p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.status = 'active'
        `);

        // In a real scenario, check payment_due_date vs current date
        for (let p of policies) {
            const msg = `Reminder: Please pay your premium of R${p.premium_amount} for policy ${p.policy_number} to keep your cover active.`;
            await sendSMS(p.phone, msg);
        }

        res.status(200).json({ message: 'Reminders sent.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};