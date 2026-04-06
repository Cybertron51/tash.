# Ledger

Ledger is a Next.js web application built with a modern stack including Supabase for backend services, Stripe for payments, and Gemini/Google Cloud Vision for card scanning and grading.

**New here?** See **[LOCAL_SETUP.md](./LOCAL_SETUP.md)** for a full start-to-finish guide (clone, `.env`, Supabase, run locally).

## Prerequisites

Before you start, make sure you have the following installed:
- [Node.js](https://nodejs.org/en/) (v18 or newer recommended)
- [npm](https://www.npmjs.com/) or another package manager
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local database development)
- [Stripe CLI](https://docs.stripe.com/stripe-cli) (for testing webhooks)

## Getting Started

### 1. Clone the repository and install dependencies

```bash
git clone <repository-url>
cd Ledger
npm install
```

### 2. Set up environment variables

Copy the example environment file:
```bash
cp .env.example .env
```

Open `.env` and fill in the required keys:

- **Supabase**: 
  - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Found in your Supabase project API settings.
  - `SUPABASE_SERVICE_ROLE_KEY`: Required for admin operations.
- **AI / Vision**:
  - `GOOGLE_CLOUD_VISION_KEY`: Set up a Google Cloud Project and enable the Vision API.
  - `GEMINI_GENERATIVE_API_KEY`: Get an API key from Google AI Studio.
- **Stripe**:
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_ACCOUNT_ID` from your Stripe Dashboard.
  - Webhook secrets will be generated in step 4.
- **Card APIs**:
  - `PSA_API_TOKEN`: Used for querying PSA card details.
  - `NEXT_PUBLIC_API_SECRET`: A custom secret for protecting specific API routes.

### 3. Database Initialization (Supabase)

If you are using a local Supabase setup, you can start it and run the migrations/seed script:

```bash
supabase start
supabase db reset
```
This will apply the database schema and populate it with the demo data found in `supabase/seed.sql`.

If you are connecting to a remote Supabase project, make sure to link your project and push up the schema:
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 4. Set up Stripe Webhooks for Local Development

To test Stripe features locally (like deposits), you'll need the Stripe CLI to forward events to your local server.

In a separate terminal window, run:
```bash
stripe listen --forward-to localhost:3000/api/deposit/webhook
```

The CLI will print a webhook signing secret (starts with `whsec_...`). Take this secret and paste it into your `.env` file for:
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CONNECT_WEBHOOK_SECRET` (if applicable)

### 5. Run the Development Server

Start the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.
