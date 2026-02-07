const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: 'No token provided.' });

    jwt.verify(token.split(" ")[1], process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(500).json({ message: 'Failed to authenticate token.' });
        req.user = decoded; // Contains id and role
        next();
    });
};

exports.isAdminOrEmployee = (req, res, next) => {
    if (req.user.role === 'admin' || req.user.role === 'employee') {
        next();
    } else {
        res.status(403).json({ message: 'Access denied. Staff only.' });
    }
};