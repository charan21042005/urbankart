<div align="center">

# 🛒 UrbanKart
**Intelligent NoSQL E-Commerce Platform**

![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

*A comprehensive demonstration of advanced document-oriented database design, flexible schema management, and performance optimization techniques for CSE494.*

</div>

## 📖 Overview
UrbanKart is a multi-vendor e-commerce platform built as an academic capstone. It transcends a basic CRUD application to explore intelligent NoSQL capabilities, including embedding vs. referencing, the Attribute Pattern, and MongoDB transactions, to solve real-world relational bottlenecks.

## 🏗️ High-Level Architecture
UrbanKart processes operations through a clean, decoupled SOA (Service-Oriented Architecture):

```mermaid
flowchart TD
    A[React Client UI] -->|REST API| B(Express.js Backend)
    B --> C{Services Layer}
    C -->|Mongoose ODM| D[(MongoDB Atlas)]
    
    subgraph Database Features
    D --> E[Attribute Pattern]
    D --> F[Schema Validation]
    D --> G[ACID Transactions]
    D --> H[Aggregation Pipelines]
    end
```

### 🧩 Core Modules
| Module | Purpose | Technology | Status |
|---|---|---|---|
| **M1 – Database Foundation** | Schema design & validation | MongoDB, Mongoose | 🟢 Planned |
| **M2 – Express API Core** | RESTful routing & controllers | Node.js, Express | 🟢 Planned |
| **M3 – Authentication** | Secure vendor/user access | JWT, bcrypt | 🟢 Planned |
| **M4 – E-Commerce Engine** | Cart & Checkout Transactions | MongoDB Transactions | 🟢 Planned |
| **M5 – Intelligent Analytics** | Complex queries & recommendations | MongoDB Aggregations | 🟢 Planned |
| **M6 – React Client** | Interactive frontend portal | React, TailwindCSS | 🟢 Planned |

## 🛠️ Technology Stack
<details>
<summary><b>View Tech Stack</b></summary>

- **Frontend:** React.js, TailwindCSS
- **Backend:** Node.js, Express.js
- **Database:** MongoDB Atlas, Mongoose ODM
- **Authentication:** JSON Web Tokens (JWT)
- **Infrastructure:** Git, GitHub Monorepo
</details>

## 📅 Day-wise Roadmap
* **Day 1: Project Foundation** (Monorepo, GitHub setup)
* **Day 2: Database Schemas** (Mongoose, Attribute Pattern)
* **Day 3: Core API & Auth** (Express, JWT)
* **Day 4: Checkout & Transactions** (MongoDB ACID)
* **Day 5: Intelligent Analytics** (Aggregation Pipelines)
* **Day 6: React Frontend & Review** (UI Integration)

## 🚦 Current Implementation Status
**Current Phase: Day 1 — Monorepo Foundation & Initial Setup**
- [x] **Repository Setup:** Complete
- [x] **Environment Configuration:** Complete
- [x] **Monorepo Structure:** Complete
- [ ] **MongoDB Atlas Setup:** Not started
- [ ] **Mongoose Models:** Planned
- [ ] **Express API:** Planned

## 📂 Repository Structure
- `server/` - Node.js/Express Backend and MongoDB logic
- `client/` - React Frontend (To be added)
- `docs/` - Planning, roadmap, and project documentation
- `.github/workflows/` - CI automation
- `.env.example` - Environment variables template

## 🎓 Learning & Engineering Philosophy
UrbanKart is built incrementally. Each stage focuses on understanding *why* a NoSQL architectural decision is made (e.g., Embedding vs. Referencing) rather than just making it work. This ensures deep comprehension for the CSE494 academic defense.

<div align="center">
<hr>
<b>UrbanKart</b><br>
<i>Intelligent NoSQL E-Commerce Platform</i><br>
Built for CSE494 Intelligent NoSQL Databases.<br>
<br>
</div>
