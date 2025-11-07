// Agnic.ID API Configuration
export const API_CONFIG = {
  // Base URLs for different environments
  development: {
    BASE_URL: 'http://localhost:3000',
    WALLET_API: '/api/wallet',
    SELLER_API: '/api/seller',
    FRONTEND: '/'
  },
  production: {
    BASE_URL: process.env.VITE_BASE_URL || '',
    WALLET_API: '/api/wallet',
    SELLER_API: '/api/seller', 
    FRONTEND: '/'
  }
};

// Get current environment config
const env = import.meta.env.MODE || 'development';
export const config = API_CONFIG[env as keyof typeof API_CONFIG] || API_CONFIG.development;

// Helper functions
export const getWalletApiUrl = (path: string = '') => 
  `${config.WALLET_API}${path}`;

export const getSellerApiUrl = (path: string = '') => 
  `${config.SELLER_API}${path}`;

export const getFullUrl = (path: string = '') => 
  `${config.BASE_URL}${path}`;

// Service endpoints
export const ENDPOINTS = {
  // Wallet API endpoints
  wallet: {
    status: getWalletApiUrl('/status'),
    profile: getWalletApiUrl('/profile'),
    credentials: getWalletApiUrl('/credentials'),
    export: getWalletApiUrl('/export'),
    keys: getWalletApiUrl('/keys'),
    agent: getWalletApiUrl('/agent'),
  },
  
  // Seller API endpoints  
  seller: {
    jobs: getSellerApiUrl('/jobs'),
    pay: getSellerApiUrl('/pay'),
    redeem: getSellerApiUrl('/redeem'),
    health: getSellerApiUrl('/health'),
  },
  
  // Main server endpoints
  health: '/health'
};

export default config;