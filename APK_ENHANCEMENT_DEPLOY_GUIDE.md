# Deploy guide for enhanced APK backend

This API update is required for the enhanced APK.

## New migration

migrations/006_mobile_app_enhancements.sql

It adds:
- whatsapp_otp_codes
- business_online_shops
- online_shop_orders

## New env variables on Railway

WA_ENGINE_BASE_URL=https://wa-engine-deploy-production.up.railway.app
WA_ENGINE_API_KEY=your_whatsapp_engine_api_key
ALLOW_DEMO_OTP=false

For temporary testing without WhatsApp key, set:
ALLOW_DEMO_OTP=true

## New endpoints

WhatsApp OTP:
- POST /api/auth/request-otp
- POST /api/auth/verify-otp

POS:
- POST /api/pos/sale

Owner shop:
- GET /api/shop/profile
- POST /api/shop/profile
- GET /api/shop/orders
- PATCH /api/shop/orders/:publicId/status

Public/customer shop:
- GET /api/shop/public/:shopCode
- POST /api/shop/public/:shopCode/orders

## Security note

WhatsApp API key is stored only in Railway backend environment variables. It is not included in the Android APK.
