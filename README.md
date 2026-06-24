# EnxtBrain

EnxtBrain is a high-fidelity Next.js operational workspace and founder command dashboard. It functions as a document-native CRM and repository memory manager for tracking employees, AI projects, clients, and leads.

Vercel Link: https://enxt-brain.vercel.app/

It integrates search indexing, AES-256-CBC field encryption, Firestore data synchronization, and a grounded AI assistant powered by the Google Gemini API.
---

## Key Features

*   **Founder Command Dashboard**: Key high-level operational metric cards (employee payroll, project budgets, open pipeline value) with watchlist sections for tracking at-risk projects and active leads.
*   **Employee Registry**: Renders department groups, monthly payroll tracking, and verified document vaults (Offer Letters, PAN, Aadhaar Cards) with dynamic payment history reconstruction from import sheets.
*   **AI Project Register**: Monitors project scope, delivery stages (Planning, In Progress, Completed), health metrics, and budget statuses.
*   **CRM Lead Pipeline**: Interactive horizontal drag-and-drop kanban board mapping leads through proposal, contact, and completion stages.
*   **AI Command Chat**: Features an operational chat interface where the founder can run queries (e.g. *List active employee salaries*) and queue record updates that must be approved via an approval write queue.
*   **Security & Decryption**: Automatic AES-256-CBC field encryption of sensitive files (URLs, PAN cards) in Firestore, with robust IV validation to prevent raw URL decryption overhead.

---

## Technology Stack

*   **Framework**: Next.js (App Router) + React
*   **Database**: Google Cloud Firestore (Firebase Admin SDK)
*   **Semantic Search**: Pinecone Vector Database
*   **AI Model**: Google Gemini API via official `@google/generative-ai` SDK (running on `gemini-2.5-flash` RAG fallback)
*   **Styling**: Premium Light Mode UI system with responsive grids, glassmorphism panel blurs, custom scrollbars, and fluid hover animations.

---

## Local Setup & Configuration

### 1. Environment Variables
Create a `.env.local` file in the root directory:

```env
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash
FALLBACK_RAG_MODEL=gemini-2.5-flash

FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-firebase-client-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-key\n-----END PRIVATE KEY-----"

PINECONE_API_KEY=your-pinecone-api-key
PINECONE_HOST=your-pinecone-host-url
PINECONE_INDEX_NAME=your-index-name
```

### 2. Run the Development Server
Install dependencies and run the project:

```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deployment

This project is optimized for deployment on **Vercel**:

```bash
# Link project and deploy to Vercel preview
npx vercel --scope harshitam21s-projects --yes

# Promote to production
npx vercel --prod --scope harshitam21s-projects --yes
```

