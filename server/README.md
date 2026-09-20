<div align="center">
  <h2>⚙️ UrbanKart Server (Backend)</h2>
  <p><strong>Node.js & Express API for Intelligent NoSQL</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Express.js-404D59?style=for-the-badge" alt="Express.js" />
    <img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
    <img src="https://img.shields.io/badge/Mongoose-880000?style=for-the-badge&logo=mongoose&logoColor=white" alt="Mongoose" />
  </p>
</div>

---

### 📝 Overview
This directory contains the RESTful backend for the UrbanKart e-commerce platform. It is designed to act as the core data processing and business logic layer, demonstrating advanced MongoDB capabilities for CSE494.

### 🏛️ Architecture & Structure
The server follows a modular, Service-Oriented Architecture (SOA) pattern:

- **`/models`**: Mongoose schemas enforcing MongoDB Document Validation.
- **`/controllers`**: Request handlers mapping HTTP routes to business logic.
- **`/routes`**: Express routers defining the API endpoints.
- **`/services`**: Core business logic (e.g., checkout process, recommendation engine).
- **`/middleware`**: Reusable request interceptors (JWT Auth, Error Handling).
- **`/config`**: Database and environment configurations.

### 🚀 Upcoming Features
- JWT-based authentication and role authorization.
- Advanced querying with MongoDB Aggregation Pipelines.
- Concurrency control for stock management using Transactions.
