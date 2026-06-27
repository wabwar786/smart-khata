# Smart Khata API changes for enhanced APK

Added for the enhanced APK:

1. WhatsApp OTP login endpoints:
   - POST /api/auth/request-otp
   - POST /api/auth/verify-otp

2. Backend-only WhatsApp engine config:
   - WA_ENGINE_BASE_URL
   - WA_ENGINE_API_KEY
   - ALLOW_DEMO_OTP

3. Owner shop module:
   - GET /api/shop/profile
   - POST /api/shop/profile
   - GET /api/shop/orders
   - PATCH /api/shop/orders/:publicId/status
   - GET /api/shop/public/:shopCode
   - POST /api/shop/public/:shopCode/orders

4. Fast POS endpoint:
   - POST /api/pos/sale

5. Migration:
   - migrations/006_mobile_app_enhancements.sql

Important Railway variable:

WA_ENGINE_API_KEY=your-whatsapp-engine-api-key

The APK does not store the WhatsApp engine key. It calls Smart Khata API, and Smart Khata API sends OTP through WhatsApp engine.
