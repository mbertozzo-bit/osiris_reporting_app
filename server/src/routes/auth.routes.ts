import express from 'express';
import { 
  validateLoginCredentials, 
  generateToken,
  authenticate,
  revokeToken,
  AuthRequest 
} from '../middleware/auth.middleware';

const router = express.Router();

// Login endpoint
router.post('/login', (req, res): void => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }
    
    const isValid = validateLoginCredentials(username, password);
    
    if (!isValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    
    const token = generateToken(username);
    
    res.json({
      success: true,
      token,
      user: { username }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint (client-side token removal)
router.post('/logout', authenticate, (req: AuthRequest, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    revokeToken(token);
  }

  res.json({ success: true });
});

// Validate token endpoint
router.get('/validate', authenticate, (req: AuthRequest, res) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// Change password endpoint
router.post('/change-password', authenticate, (_req: AuthRequest, res) => {
  // Note: In production, this would update environment variables or a config file
  // For this app, we're keeping it simple with hardcoded credentials
  res.json({ 
    success: true, 
    message: 'Password change functionality requires server configuration update' 
  });
});

export default router;
