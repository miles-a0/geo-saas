# Geo-SaaS Platform Specification

## Executive Summary

This document outlines the architecture for a commercial Geo-SaaS platform that transforms the open-source [geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude) tool into a fully-featured SaaS product. The platform enables users to generate professional GEO (Generative Engine Optimization) SEO reports for their websites, with Stripe-powered payments and automated email delivery.

### Key Requirements from User
- **Deployment**: Docker container on Cloud VPS with Docker Compose
- **Admin Panel**: Full management capabilities
- **Payments**: Stripe integration with two tiers:
  - £20 per individual report
  - £15/month (billed annually) for 12 monthly reports
- **Email**: Automated report delivery upon completion
- **Customer Accounts**: Historical data storage and retrieval
- **Report Repository**: Downloadable client reports

---

## 1. Technical Stack

### Core Technologies

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Backend** | Node.js 20 + Express | REST API server |
| **Database** | PostgreSQL 15 | Primary data store |
| **Cache/Sessions** | Redis 7 | Session management, caching |
| **Queue** | BullMQ + Redis | Async job processing (report generation) |
| **Frontend** | React 18 + TypeScript | Admin & customer dashboards |
| **Styling** | Tailwind CSS | UI components |
| **Authentication** | JWT + bcrypt | Secure user management |
| **Email** | Nodemailer + SendGrid/SMTP | Transactional emails |
| **Payments** | Stripe API | Subscription & one-time payments |
| **File Storage** | Local filesystem (or S3-compatible) | Report PDF storage |
| **Docker** | Docker Compose | Container orchestration |
| **GEO Analysis Engine** | Python 3.11 + CLI tools | Core audit functionality |

### Infrastructure Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloud VPS (Docker)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Nginx       │  │   React App   │  │   Node.js    │         │
│  │   (Reverse    │◄─┤   (Frontend) │◄─┤   (API)      │         │
│  │    Proxy)     │  │               │  │               │         │
│  └──────────────┘  └──────────────┘  └───────┬────────┘         │
│                                               │                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────┴────────┐        │
│  │  PostgreSQL  │  │    Redis     │  │  Python Worker │        │
│  │   (Database) │  │  (Queue/Cache)│  │  (Report Gen)  │        │
│  └──────────────┘  └──────────────┘  └────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema

### Core Tables

#### Users (Customer Accounts)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  company VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  subscription_tier ENUM('free', 'one_time', 'monthly') DEFAULT 'free',
  subscription_status ENUM('active', 'canceled', 'past_due', 'trialing') DEFAULT 'free',
  subscription_start_date TIMESTAMP,
  subscription_end_date TIMESTAMP,
  monthly_reports_remaining INTEGER DEFAULT 0,
  total_reports_purchased INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  email_verified BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE
);
```

#### Reports (Historical Data & Repository)
```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  website_url VARCHAR(2048) NOT NULL,
  website_name VARCHAR(255),
  geo_score INTEGER,
  ai_visibility_score INTEGER,
  citability_score INTEGER,
  brand_mentions_score INTEGER,
  technical_score INTEGER,
  content_score INTEGER,
  schema_score INTEGER,
  platform_score INTEGER,
  report_data JSONB,
  pdf_path VARCHAR(512),
  pdf_filename VARCHAR(255),
  status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  credit_used INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX idx_reports_website_url ON reports(website_url);
```

#### Payments & Credits
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255),
  amount_paid INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'gbp',
  payment_type ENUM('one_time', 'subscription', 'ref,
  creditsund') NOT NULL_purchased INTEGER,
  status ENUM('pending', 'succeeded', 'failed', 'refunded') DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  transaction_type ENUM('purchase', 'report_generation', 'refund', 'subscription_credit') NOT NULL,
  payment_id UUID REFERENCES payments(id),
  report_id UUID REFERENCES reports(id),
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Audit Logs (Admin)
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  admin_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### API Keys (Developer Access)
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  permissions JSONB DEFAULT '["read"]',
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 3. Payment & Subscription Flow

### Stripe Integration

#### Product Configuration in Stripe
```
Product 1: Individual GEO Report
- Price: £20.00 GBP (one-time)
- Product ID: prod_individual_report

Product 2: Monthly Subscription (12 Reports)
- Price: £15.00/month (billed annually = £180/year)
- Product ID: prod_monthly_subscription
- Features:
  - 12 reports per year
  - Rollover unused reports (optional)
  - Priority processing
  - Email support
```

#### Checkout Flow

```
User clicks "Generate Report"
         │
         ▼
┌─────────────────────┐
│ Check Subscription │
│   & Credits        │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    │ Has Credits?│
    └──────┬──────┘
      Yes │ No
      ┌───┘ └──┐
      ▼        ▼
┌──────────┐ ┌────────────┐
│ Queue    │ │ Stripe     │
│ Report   │ │ Checkout   │
│ Job      │ └─────┬──────┘
└──────────┘       │
                  ▼
         ┌────────────────┐
         │ Payment Success│
         │ → Add Credit   │
         │ → Queue Job    │
         └────────────────┘
```

#### Webhook Handlers Required

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Add credits to user account |
| `customer.subscription.created` | Update user subscription status |
| `customer.subscription.updated` | Sync subscription changes |
| `customer.subscription.deleted` | Handle cancellation |
| `invoice.payment_succeeded` | Process subscription payment |
| `invoice.payment_failed` | Handle failed payment |

### Credit Management

- **One-time purchase**: +1 credit per £20 payment
- **Subscription**: +1 credit monthly (auto-credited on billing date)
- **Credit rollover**: Unused credits roll over month-to-month for subscribers
- **Credit expiry**: Individual credits expire after 12 months

---

## 4. Report Generation Pipeline

### Async Job Queue (BullMQ)

```javascript
// Job: Generate GEO Report
{
  userId: UUID,
  websiteUrl: string,
  reportId: UUID,
  priority: 'high' | 'normal' | 'low'
}
```

#### Processing Steps

1. **Queue Job** → Add to BullMQ with appropriate priority
2. **Fetch Website** → Python script fetches page content
3. **Run Analysis** → Execute geo-seo-claude analysis
4. **Generate PDF** → Create professional PDF report
5. **Save Report** → Store PDF to filesystem/S3
6. **Update DB** → Mark report complete with scores
7. **Email User** → Send report via email with download link
8. **Deduct Credit** → -1 credit from user balance

### Queue Configuration

```javascript
const queueConfig = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    timeout: 300000 // 5 minutes max
  },
  limiter: {
    max: 5,
    duration: 60000 // 5 reports per minute max
  }
};
```

---

## 5. API Design

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/logout` | Invalidate session |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/verify-email` | Verify email address |

### User & Account Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/profile` | Get user profile |
| PUT | `/api/users/profile` | Update profile |
| GET | `/api/users/credits` | Get credit balance |
| GET | `/api/users/credit-history` | Get transaction history |

### Reports Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports` | List user's reports |
| POST | `/api/reports` | Queue new report generation |
| GET | `/api/reports/:id` | Get report details |
| GET | `/api/reports/:id/download` | Download PDF |
| DELETE | `/api/reports/:id` | Delete report |

### Payments Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/create-checkout` | Create Stripe checkout |
| POST | `/api/payments/webhook` | Stripe webhook handler |
| GET | `/api/payments/history` | Get payment history |
| POST | `/api/payments/create-subscription` | Create subscription |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/users/:id` | Get user details |
| PUT | `/api/admin/users/:id` | Update user |
| DELETE | `/api/admin/users/:id` | Delete user |
| GET | `/api/admin/reports` | List all reports |
| GET | `/api/admin/reports/:id` | Get report details |
| GET | `/api/admin/analytics` | Dashboard analytics |
| GET | `/api/admin/audit-logs` | View audit logs |
| POST | `/api/admin/reports/:id/regenerate` | Regenerate report |

---

## 6. Frontend Architecture

### Admin Dashboard (`/admin`)

#### Pages
1. **Dashboard** (`/admin`)
   - Total users, reports generated, revenue metrics
   - Recent activity feed
   - System health status

2. **Users** (`/admin/users`)
   - User table with search/filter
   - View/edit user details
   - Manually add credits
   - Cancel subscriptions

3. **Reports** (`/admin/reports`)
   - All generated reports
   - Filter by status, user, date
   - View report details
   - Regenerate failed reports

4. **Payments** (`/admin/payments`)
   - Payment history
   - Refund management
   - Revenue reports

5. **Settings** (`/admin/settings`)
   - Site configuration
   - Email templates
   - API keys management

### Customer Portal (`/dashboard`)

#### Pages
1. **Overview** (`/dashboard`)
   - Credit balance
   - Recent reports
   - Quick actions

2. **Generate Report** (`/dashboard/new-report`)
   - Enter website URL
   - Select report type
   - Checkout if needed

3. **My Reports** (`/dashboard/reports`)
   - List of all reports
   - Search/filter
   - Download PDFs

4. **Billing** (`/dashboard/billing`)
   - Current subscription
   - Payment methods
   - Upgrade/downgrade

5. **Settings** (`/dashboard/settings`)
   - Profile management
   - Password change
   - Email preferences

---

## 7. Email Templates

### Transactional Emails

| Template | Trigger | Content |
|----------|---------|---------|
| Welcome | Account creation | Welcome message, getting started |
| Verify Email | Registration | Verification link |
| Report Complete | Report generation done | Download link, summary |
| Payment Receipt | Purchase complete | Receipt, credit confirmation |
| Subscription Confirmed | Subscription start | Subscription details |
| Subscription Ending | 7 days before renewal | Renewal reminder |
| Subscription Canceled | Cancellation | Confirmation, final date |
| Low Credits | Balance < 2 | Replenishment prompt |

---

## 8. Docker Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  # Reverse Proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - frontend
      - api
    networks:
      - geo-saas

  # Frontend React App
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    environment:
      - REACT_APP_API_URL=${API_URL}
    depends_on:
      - api
    networks:
      - geo-saas

  # Node.js API
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
      - EMAIL_HOST=${EMAIL_HOST}
      - EMAIL_PORT=${EMAIL_PORT}
      - EMAIL_USER=${EMAIL_USER}
      - EMAIL_PASSWORD=${EMAIL_PASSWORD}
    depends_on:
      - postgres
      - redis
    networks:
      - geo-saas

  # Python Report Worker
  worker:
    build:
      context: ./worker
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    volumes:
      - ./reports:/app/reports
    depends_on:
      - postgres
      - redis
    networks:
      - geo-saas

  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - geo-saas

  # Redis Cache & Queue
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - geo-saas

volumes:
  postgres_data:
  redis_data:

networks:
  geo-saas:
    driver: bridge
```

### Environment Variables (.env)

```bash
# App
NODE_ENV=production
REACT_APP_API_URL=https://geo-yourdomain.com/api
FRONTEND_URL=https://geo-yourdomain.com

# Database
DB_USER=geosaas
DB_PASSWORD=secure_password
DB_NAME=geosaas_prod
DATABASE_URL=postgresql://geosaas:secure_password@postgres:5432/geosaas_prod

# Redis
REDIS_URL=redis://redis:6379

# Auth
JWT_SECRET=super_secure_jwt_secret_change_me

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Email
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASSWORD=SG.xxxxx
EMAIL_FROM=noreply@geo-yourdomain.com

# Domain
DOMAIN=geo-yourdomain.com
```

---

## 9. Additional Enhancement Recommendations

### Tiered Pricing Strategy

| Tier | Price | Features |
|------|-------|----------|
| **Free** | £0 | Limited demo (1 page, no PDF) |
| **Pay-Per-Report** | £20/report | Full PDF, email delivery |
| **Pro Monthly** | £15/month (annual) | 12 reports/year, priority, API access |
| **Agency** | £99/month | 100 reports, white-label, API, priority support |

### White-Label Options
- Custom domain support (`reports.yourdomain.com`)
- Custom branding (logo, colors) on reports
- Remove "Powered by Geo-SaaS" footer

### API Access
- RESTful API for developers
- Programmatic report generation
- Webhook notifications for report completion
- Rate limiting with tiered access

### Advanced Features

1. **Competitor Comparison**
   - Compare 2-5 websites side-by-side
   - Highlight winning strategies

2. **Historical Tracking**
   - Track GEO score over time
   - Show improvement metrics

3. **Multi-Language Support**
   - Reports in multiple languages
   - Local market analysis

4. **AI Recommendations**
   - Actionable checklist generation
   - Integration with CMS platforms

5. **Team Collaboration**
   - Multiple team members per account
   - Role-based access (Admin, Editor, Viewer)

6. **Scheduled Reports**
   - Monthly automated audits
   - Trend analysis

### Marketing & Growth

1. **Lead Magnet Funnel**
   - Free mini-audit (quick snapshot)
   - Email capture for full report

2. **Affiliate Program**
   - 20% commission on referrals
   - Tiered commission rates

3. **Enterprise Sales**
   - Custom pricing
   - Dedicated support
   - SLA guarantees

---

## 10. Security Considerations

### Authentication
- JWT tokens with short expiry (15 min access, 7 day refresh)
- Passwords hashed with bcrypt (12+ rounds)
- Rate limiting on auth endpoints
- Account lockout after 5 failed attempts

### Payment Security
- Stripe Elements for card handling (PCI compliant)
- No card data stored on our servers
- Webhook signature verification

### Data Protection
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding)
- CSRF tokens on all forms
- HTTPS enforced everywhere
- GDPR compliance (data export, deletion)

---

## 11. Development Roadmap

### Phase 1: MVP (Weeks 1-4)
- [x] Project setup & Docker config
- [ ] Backend API with auth
- [ ] Database schema & migrations
- [ ] Basic report generation (Python worker)
- [ ] Customer dashboard (React)
- [ ] Stripe integration (one-time payments)
- [ ] Email delivery

### Phase 2: Subscriptions (Weeks 5-6)
- [ ] Stripe subscription integration
- [ ] Credit management system
- [ ] Admin dashboard
- [ ] Analytics & reporting

### Phase 3: Enhancements (Weeks 7-10)
- [ ] White-label options
- [ ] API access
- [ ] Team features
- [ ] Advanced analytics

### Phase 4: Scale (Weeks 11-12)
- [ ] Performance optimization
- [ ] Caching layer
- [ ] Monitoring & alerting
- [ ] Documentation

---

## 12. File Structure

```
geo-saas/
├── docker-compose.yml
├── nginx.conf
├── .env.example
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── config/
│   │   │   └── database.ts
│   │   ├── models/
│   │   │   ├── User.ts
│   │   │   ├── Report.ts
│   │   │   └── Payment.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── reports.ts
│   │   │   ├── payments.ts
│   │   │   └── admin.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   └── admin.ts
│   │   ├── services/
│   │   │   ├── stripe.ts
│   │   │   ├── email.ts
│   │   │   └── queue.ts
│   │   └── utils/
│   └── Dockerfile
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── public/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── NewReport.tsx
│   │   │   ├── Reports.tsx
│   │   │   ├── Billing.tsx
│   │   │   ├── admin/
│   │   │   │   ├── AdminDashboard.tsx
│   │   │   │   ├── Users.tsx
│   │   │   │   └── Reports.tsx
│   │   └── hooks/
│   └── Dockerfile
├── worker/
│   ├── requirements.txt
│   ├── geo_seo/
│   │   ├── __init__.py
│   │   ├── runner.py
│   │   └── pdf_generator.py
│   ├── scripts/
│   │   └── (copied from geo-seo-claude)
│   └── Dockerfile
└── ssl/
    ├── server.crt
    └── server.key
```

---

## Summary

This specification provides a complete blueprint for building a commercial Geo-SaaS platform. The architecture leverages:

- **Modern, scalable stack**: Node.js, React, PostgreSQL, Redis
- **Async processing**: BullMQ for reliable report generation
- **Secure payments**: Full Stripe integration with subscriptions
- **Docker deployment**: Production-ready containerization
- **Comprehensive features**: Admin panel, customer portal, API access

The estimated development timeline is **10-12 weeks** for a production-ready MVP with subscriptions.
