# 🕷️ NEO-PRYCE | Multiverse Price & Inventory Intelligence Portal

> **A Real-Time Web Scraping, E-Commerce Arbitrage & AI Intelligence Platform powered by Bright Data Scraper Studio, Hugging Face Datasets & Qwen-32B AI Inference.**

---

## 📌 Table of Contents
- [Overview](#-overview)
- [Bright Data Scraper Studio & Web Unlocker Integration](#-bright-data-scraper-studio--web-unlocker-integration)
- [Hugging Face Datasets & AI Inference Pipeline](#-hugging-face-datasets--ai-inference-pipeline)
- [System Architecture](#-system-architecture)
- [Example Structured Output](#-example-structured-output)
- [Local Setup & Installation](#-local-setup--installation)
- [AI Assistance Disclosure & Technical Decisions](#-ai-assistance-disclosure--technical-decisions)
- [Hackathon Submission & Demo Checklist](#-hackathon-submission--demo-checklist)

---

## 🚀 Overview

**NEO-PRYCE** is an advanced e-commerce price-comparison, price-drop tracking, and arbitrage intelligence platform. It resolves a major challenge in modern retail: **hidden price drops, misleading MSRP discounts, and regional price discrepancies**.

### Key Capabilities:
- **Universal Live Web Crawling**: Extracts real-time product titles, live prices (e.g. ₹79), availability, and high-resolution product photos directly from e-commerce product pages (Amazon, Flipkart, Croma, etc.).
- **Bright Data Scraper Studio Engine**: Custom headless web unlocking and anti-bot bypass pipeline utilizing Bright Data API.
- **Hugging Face Datasets Hub**: Cross-matches scraped items against 1.4M+ e-commerce product records (`carlacdf/amazon_reviews_electronics`).
- **Hugging Face Qwen-32B AI Model**: Evaluates deal quality, risk factors, and 30-day price trends using LLM inference (`Qwen/Qwen2.5-Coder-32B-Instruct`).
- **Cyberpunk Multiverse UI**: Interactive Chart.js price trend curves, regional price matrices, and real-time telemetry streaming.

---

## ⚡ Bright Data Scraper Studio & Web Unlocker Integration

This project uses **Bright Data** to ensure reliable, high-speed, anti-bot-resilient data ingestion from public e-commerce websites.

### 🛠️ Scraper Studio & Web Unlocker Implementation:
1. **Endpoint**: `https://api.brightdata.com/request`
2. **Zone Configuration**: Headless Web Unlocker Proxy Zone (`unblocker`).
3. **Execution Logic**:
   - The backend server (`server.js` / `backend_server.ps1`) reads `BRIGHTDATA_API_KEY` and `BRIGHTDATA_ZONE` from environment variables (`.env`).
   - When a user submits an e-commerce product URL to `POST /api/scrape`, the server dispatches an authenticated HTTP request to Bright Data's Web Unlocker endpoint.
   - Bright Data handles JavaScript rendering, CAPTCHA resolution, dynamic header rotation, and IP rotation.
   - The returned HTML page is parsed by NeoPryce's recursive regex engine to extract high-resolution product images (`data-a-dynamic-image`, `landingImage`, `og:image`), prices (`a-price-whole`, `priceToPay`, `og:price:amount`), and titles.

---

## 🤗 Hugging Face Datasets & AI Inference Pipeline

NEO-PRYCE enriches scraped raw web data using a 2-stage Hugging Face integration:

1. **Hugging Face Datasets Hub**:
   - Dataset: `carlacdf/amazon_reviews_electronics`
   - Purpose: Validates scraped products against 1.4M+ historical e-commerce catalog items to detect price anomalies and historical baseline pricing.

2. **Hugging Face AI Inference API**:
   - Model: `Qwen/Qwen2.5-Coder-32B-Instruct`
   - Purpose: Analyzes product metadata, user sentiment, and price points to return structured AI deal ratings (`strong`, `fair`), 30-day trend forecasts, and risk assessments.

---

## 🏛️ Architecture & Libraries Used (Loaded via CDN)

This is a pure high-performance HTML/CSS/JS application with **zero complex build steps, bundlers, or heavy frameworks**.

### 📁 Architecture Breakdown:
- **[`index.html`](file:///c:/Users/DELL/Downloads/stitch_multiverse_price_portal%20%282%29/stitch_multiverse_price_portal/index.html)**: Main DOM layout and UI components. Uses Tailwind CSS via CDN.
- **[`css/custom.css`](file:///c:/Users/DELL/Downloads/stitch_multiverse_price_portal%20%282%29/stitch_multiverse_price_portal/css/custom.css)**: Custom cyberpunk theme overrides, spider-web background effects, and glowing LED indicators.
- **[`js/app.js`](file:///c:/Users/DELL/Downloads/stitch_multiverse_price_portal%20%282%29/stitch_multiverse_price_portal/js/app.js)**: Tab routing, dynamic UI card rendering, and live telemetry log stream handlers.
- **[`js/graphics-effects.js`](file:///c:/Users/DELL/Downloads/stitch_multiverse_price_portal%20%282%29/stitch_multiverse_price_portal/js/graphics-effects.js)**: Lenis smooth kinetic scrolling, GSAP card entrance animations, warp speed canvas, and Web Audio API synthesizer.
- **[`js/backend-engine.js`](file:///c:/Users/DELL/Downloads/stitch_multiverse_price_portal%20%282%29/stitch_multiverse_price_portal/js/backend-engine.js)**: Connects to `/api/scrape` and processes live Bright Data & Hugging Face data.

### 📦 Libraries Used (Loaded via CDN in `index.html`):
- **Tailwind CSS** (CSS styling framework)
- **Chart.js** (ML price curves & trend charts)
- **Lenis** (Kinetic smooth scrolling)
- **GSAP & ScrollTrigger** (High-performance timeline motion & card animations)
- **Web Audio API** (Procedural futuristic UI audio synthesizer)

---

## 🏗️ System Architecture

```
[ User Input / Product URL ]
            │
            ▼
[ Bright Data Web Unlocker API ] ──► (Headless Unblocker & Proxy Rotation)
            │
            ▼
[ Multi-Selector DOM & Photo Extractor ] ──► (Price, Title & High-Res Photo Extraction)
            │
            ▼
[ Hugging Face Datasets Hub ] ──► (carlacdf/amazon_reviews_electronics catalog match)
            │
            ▼
[ Hugging Face Qwen-32B AI Model ] ──► (LLM Opportunity & Sentiment Evaluation)
            │
            ▼
[ NeoPryce Interactive Portal ] ──► (Cyberpunk UI, Chart.js Curves & Arbitrage Alerts)
```

---

## 📄 Example Structured Output

Every execution of `POST /api/scrape` returns a validated, normalized JSON payload:

```json
{
  "status": "success",
  "jobId": "job-639230850048479731",
  "targetUrl": "https://www.amazon.in/Taparia-WS-05-Steel-Stripping-Plier/dp/B00V42S8D6",
  "fetchProvider": "BrightData Web Unlocker API + Hugging Face Hub",
  "pipeline": [
    "url_validated",
    "page_fetched",
    "huggingface_dataset_matched",
    "product_data_extracted",
    "product_data_normalized",
    "quality_checked",
    "ai_analysis_completed"
  ],
  "product": {
    "title": "Taparia WS 05 Steel (130mm) Wire Stripping Plier (Green and Black)",
    "brand": "Taparia",
    "category": "Tools & Hardware / Pliers",
    "price": 79.00,
    "currency": "INR",
    "availability": "IN_STOCK",
    "condition": "NEW",
    "seller": "Amazon India",
    "imageUrl": "https://m.media-amazon.com/images/I/71Vj0qZ95sL._SL1500_.jpg",
    "productUrl": "https://www.amazon.in/Taparia-WS-05-Steel-Stripping-Plier/dp/B00V42S8D6"
  },
  "quality": {
    "valid": true,
    "confidence": 0.98,
    "warnings": []
  },
  "aiAnalysis": {
    "status": "completed",
    "provider": "Hugging Face Inference API (Qwen/Qwen2.5-Coder-32B-Instruct)",
    "result": {
      "dealRating": "strong",
      "marketPriceAssessment": "fair",
      "priceTrend30Days": "stable",
      "riskFactors": []
    }
  },
  "fetchedAt": "2026-08-23T12:30:03.3551769Z"
}
```

---

## ⚙️ Local Setup & Installation

### Prerequisites:
- Node.js 18+ or PowerShell 5.1+
- Bright Data API Key & Hugging Face API Key (stored in `.env`)

### Installation Steps:
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/neopryce-multiverse-portal.git
   cd neopryce-multiverse-portal
   ```
2. Configure `.env` file in the root directory:
   ```env
   PORT=8080
   BRIGHTDATA_API_KEY=your_brightdata_api_key_here
   BRIGHTDATA_ZONE=unblocker
   HUGGINGFACE_API_KEY=your_huggingface_api_key_here
   HUGGINGFACE_MODEL=Qwen/Qwen2.5-Coder-32B-Instruct
   ```
3. Start the application server:
   - **Node.js**:
     ```bash
     node server.js
     ```
   - **PowerShell (Alternative)**:
     ```powershell
     powershell -ExecutionPolicy Bypass -File backend_server.ps1
     ```
4. Open **`http://localhost:8080`** in your browser.

---

## 🤖 AI Assistance Disclosure & Technical Decisions

- **AI Disclosure**: In accordance with hackathon rules, AI coding assistants (Google Antigravity) were utilized for code structuring, UI layout styling, and regex optimization.
- **Human Verification & Ownership**: All business logic, DOM regex selector patterns, API endpoint schemas, and Bright Data / Hugging Face integration architecture were reviewed, verified, and debugged by team operators:
  - **Karthik Prakash** (Project Developer)
  - **Kushal Shah** (Project Developer)
  - **Mannat Tanda** (Project Developer)
  - **Iha Pradhan** (Project Developer)

---

## 📹 Hackathon Submission & Demo Checklist

- [x] **Public Source Code Repository**
- [x] **Clear README with System Architecture**
- [x] **Bright Data Scraper Studio & Web Unlocker Explanation**
- [x] **Example Structured JSON Output**
- [x] **AI Disclosure & Team Verification Statement**
- [ ] **Demo Video Link**: *(Record 2-min video demonstrating live URL scraping at http://localhost:8080)*
- [ ] **LinkedIn Post ("Daily Bugle" Prize Track)**: Tag **@WeMakeDevs** on LinkedIn with project highlights!

---

### 👥 Team Operators
- **Karthik Prakash** | Operator 01
- **Kushal Shah** | Operator 02
- **Mannat Tanda** | Operator 03
- **Iha Pradhan** | Operator 04
