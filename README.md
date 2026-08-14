<div align="center">
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/NextJS-Dark.svg" width="60" alt="Next.js" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/TypeScript.svg" width="60" alt="TypeScript" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/Prisma.svg" width="60" alt="Prisma" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/AWS-Dark.svg" width="60" alt="AWS" />
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/Redis-Dark.svg" width="60" alt="Redis" />
  <br/>
  <br/>

  # ⚡ Blogy SEO Engine (LazyFounders)

  **An autonomous, multi-agent AI pipeline for discovering, categorizing, rewriting, and publishing high-signal tech news.**

  [![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
  [![Next.js](https://img.shields.io/badge/Next.js-14-black.svg?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![Prisma](https://img.shields.io/badge/Prisma-6.0-2D3748.svg?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
  [![BullMQ](https://img.shields.io/badge/BullMQ-5.0-FF4081.svg?style=for-the-badge)](https://bullmq.io/)
  [![AWS Bedrock](https://img.shields.io/badge/AWS%20Bedrock-Claude_3-FF9900.svg?style=for-the-badge&logo=amazonaws)](https://aws.amazon.com/bedrock/)

</div>

---

## 🚀 Overview

The **Blogy SEO Engine** is a state-of-the-art backend monorepo designed to autonomously curate content from across the web. Built on a robust microservices architecture using **Node.js, BullMQ, and Prisma**, it orchestrates specialized workers that scrape, categorize, deduplicate, and rewrite articles using **AWS Bedrock (Claude 3)**.

The end result is a highly-optimized, automated Next.js dashboard featuring beautifully watermarked images, AI-crafted summaries, and deep SEO optimizations.

## 🏗️ Architecture

The system is built as a **Turborepo** monorepo, cleanly separating concerns into independent, highly scalable microservices connected via **Redis (BullMQ)**.

```text
lazyfounders/
├── apps/
│   ├── api-dashboard/           # Next.js 14 frontend displaying the curated content
│   ├── discovery-service/       # Triggers the pipeline via sitemaps and RSS feeds
│   ├── scraper-service/         # Headless browser (Playwright) stealth scraping
│   ├── categorization-service/  # LLM-powered categorization and summarization
│   ├── intelligence-service/    # Deduplication, SEO rewriting, and Image watermarking (S3)
│   └── publishing-service/      # Finalizes content state and manages publications
├── packages/
│   ├── database/                # Shared Prisma schema and Postgres connection logic
│   ├── config/                  # Centralized configuration and environment variables
│   ├── logger/                  # Shared Pino logger setup
│   └── shared/                  # Common utilities and types
```

## ✨ Key Features

- **🕸️ Stealth Scraping**: Utilizes `playwright-extra` and stealth plugins to reliably extract content without triggering bot protections.
- **🧠 AI-Powered Categorization**: Uses AWS Bedrock (Claude 3 Haiku/Sonnet) to instantly summarize lengthy articles and assign precise taxonomy.
- **🛡️ Intelligent Deduplication**: Cross-references new articles against the vector database to prevent publishing redundant stories.
- **✍️ SEO Rewriting**: Autonomously rewrites the raw scraped content into high-quality, engaging, and SEO-optimized HTML markdown.
- **🖼️ Automated Media Processing**: Downloads header images, resizes them, applies the custom Blogy SVG watermark using `sharp`, and uploads them to AWS S3.
- **📊 Next.js Dashboard**: A sleek, dark-mode Next.js UI using Tailwind CSS to display the finalized articles with perfect lighthouse scores.

## 🛠️ Tech Stack

*   **Language**: TypeScript (Node.js >= 20)
*   **Monorepo**: npm workspaces / Turborepo
*   **Database**: PostgreSQL with `pgvector`
*   **ORM**: Prisma
*   **Message Broker**: Redis & BullMQ
*   **AI/LLM**: AWS Bedrock (Anthropic Claude 3 Models)
*   **Cloud Storage**: Amazon S3
*   **Frontend**: Next.js 14, Tailwind CSS, React Server Components

## ⚙️ Local Development Setup

### 1. Prerequisites
- Node.js >= 20.0.0
- Docker & Docker Compose (for Postgres & Redis)
- AWS CLI configured with Bedrock and S3 access

### 2. Environment Variables
Copy `.env.example` to `.env` at the root of the project and fill in your credentials:
```bash
cp .env.example .env
```
Ensure you provide your `DATABASE_URL`, `REDIS_URL`, and AWS credentials.

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Setup
```bash
# Push the Prisma schema to your local Postgres database
npm run db:push -w apps/discovery-service
```

### 5. Start the Services
You can run all microservices and the dashboard concurrently using the root script:
```bash
npm run dev:all
```
Alternatively, you can start individual services using Turborepo or npm workspaces:
```bash
npm run dev -w apps/api-dashboard
npm run dev -w apps/scraper-service
```

## 🚢 Deployment

The repository includes a `build-and-push.sh` script to containerize each service into highly optimized Docker images and push them to **AWS ECR**. 

Each microservice is designed to run as an independent **AWS ECS Fargate** task, allowing you to independently scale the Scraper workers separately from the Intelligence LLM workers based on queue depth.

```bash
# Example: Build and push all services
./build-and-push.sh
```

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/lazyfounders/blogy/issues).

---
<div align="center">
  <i>Built by Builders, for Builders.</i>
</div>
