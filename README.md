<div align="center">
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/NextJS-Dark.svg" width="60" alt="Next.js" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/TypeScript.svg" width="60" alt="TypeScript" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/Prisma.svg" width="60" alt="Prisma" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/AWS-Dark.svg" width="60" alt="AWS" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/Redis-Dark.svg" width="60" alt="Redis" />
  <br/>
  <br/>

  # 🌌 BLOGY: The Autonomous AI News Engine

  **A cybernetic, multi-agent pipeline that hunts, reads, rewrites, and publishes tech news while you sleep.**

  [![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
  [![Next.js](https://img.shields.io/badge/Next.js-14-black.svg?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![Prisma](https://img.shields.io/badge/Prisma-6.0-2D3748.svg?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
  [![BullMQ](https://img.shields.io/badge/BullMQ-5.0-FF4081.svg?style=for-the-badge)](https://bullmq.io/)
  [![AWS Bedrock](https://img.shields.io/badge/AWS%20Bedrock-Claude_3-FF9900.svg?style=for-the-badge&logo=amazonaws)](https://aws.amazon.com/bedrock/)

  _Built by Builders, for Builders._

</div>

---

## 🚀 The Vision

Running a high-quality tech publication manually is a relic of the past. **Blogy (LazyFounders)** replaces the traditional editorial room with a tireless, 24/7 AI workforce. 

It autonomously scours the internet for the highest-signal startup and product news, extracts the core value, rewrites the content for flawless SEO, watermarks the media, and deploys it to a sleek, dark-mode Next.js dashboard. **Zero manual intervention required.**

---

## 🧠 The Neural Pipeline

Blogy isn't just a script; it's a deeply orchestrated **microservices architecture** built on Turborepo, where specialized autonomous agents communicate via high-speed Redis queues.

```mermaid
graph TD
    classDef aws fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:black;
    classDef db fill:#336791,stroke:#fff,stroke-width:2px,color:white;
    classDef worker fill:#1E293B,stroke:#38BDF8,stroke-width:2px,color:white;
    classDef redis fill:#DC382D,stroke:#fff,stroke-width:2px,color:white;
    classDef ui fill:#000000,stroke:#fff,stroke-width:2px,color:white;

    A[🌐 Target Sitemaps & RSS] -->|Discovered URLs| B(Discovery Service):::worker
    B -->|Jobs| C{Redis / BullMQ}:::redis
    
    C -->|Scrape Job| D[Scraper Service <br/>Playwright Stealth]:::worker
    D -->|Raw DOM/HTML| C
    
    C -->|Categorize Job| E[Categorization Service]:::worker
    E <-->|Claude 3| F((AWS Bedrock)):::aws
    E -->|Taxonomy & Summary| C
    
    C -->|Intelligence Job| G[Intelligence Service]:::worker
    G <-->|Deduplication & SEO| F
    G -->|Watermarked Media| H[(AWS S3)]:::aws
    G -->|SEO Markdown| C
    
    C -->|Publish Job| I[Publishing Service]:::worker
    I -->|Insert Data| J[(PostgreSQL & pgvector)]:::db
    
    J <--> K[Next.js Dashboard API]:::ui
    K --> L[End User / Readers]
```

---

## ⚡ Core Systems

### 🕵️ Stealth Scraping Engine
Equipped with `playwright-extra` and stealth plugins, the Scraper Service navigates the modern web undetected. It effortlessly bypasses bot protections to extract the raw, unadulterated HTML signal from the noise.

### 🤖 LLM Categorization & Deduplication
Raw text is fed into **AWS Bedrock (Claude 3)**. The LLM acts as the Editor-in-Chief—summarizing lengthy articles, assigning rigid semantic taxonomy, and cross-referencing our vector database to ruthlessly eliminate duplicate stories.

### ✍️ Generative SEO Rewriting
Once approved, the AI crafts a completely original, engaging, and highly SEO-optimized markdown article. It generates custom meta descriptions, keywords, and semantic HTML structures that search engines love.

### 🎨 Automated Media Processing
No article is complete without visuals. The Intelligence pipeline intercepts raw images, resizes them, applies the custom Blogy SVG watermark using Node.js `sharp`, and securely offloads them to **Amazon S3**.

### 🌌 The Next.js 14 Dashboard
The final stop is the user interface. A blazing-fast, strictly typed Next.js App Router frontend consuming the Prisma database. It features responsive grid layouts, automated fallback images, and perfect Lighthouse scores.

---

## 🏗️ Repository Structure

A masterclass in separation of concerns, powered by **Turborepo**:

```text
lazyfounders/
├── apps/
│   ├── api-dashboard/           # Next.js 14 frontend 
│   ├── discovery-service/       # The URL Hunter
│   ├── scraper-service/         # The Stealth Extractor
│   ├── categorization-service/  # The AI Editor
│   ├── intelligence-service/    # The SEO Writer & Media Processor
│   └── publishing-service/      # The Database Committer
├── packages/
│   ├── database/                # Shared Prisma schema
│   ├── config/                  # Global environment variables
│   ├── logger/                  # Universal Pino logging
│   └── shared/                  # Common Types & Utilities
```

---

## 🛠️ Booting the Engine (Local Dev)

Ready to spin up your own AI workforce?

**1. Prerequisites**
- Node.js >= 20.0.0
- Docker & Docker Compose (for Postgres & Redis)
- AWS CLI configured with Bedrock and S3 access

**2. Environment Configuration**
```bash
cp .env.example .env
```
*(Ensure `DATABASE_URL`, `REDIS_URL`, and AWS credentials are set).*

**3. Install & Sync**
```bash
npm install
npm run db:push -w apps/discovery-service
```

**4. Ignite the Pipeline**
Run the entire microservice cluster concurrently:
```bash
npm run dev:all
```

---

## 🚢 Cloud Deployment

Blogy is architected for the cloud. The included `build-and-push.sh` script containerizes every microservice into highly optimized Docker images.

Deploy seamlessly to **AWS ECS Fargate**, allowing you to independently scale your Scraper workers separately from your LLM Intelligence workers based purely on Redis queue depth.

---
<div align="center">
  <i>"The future of publishing is autonomous."</i>
</div>
