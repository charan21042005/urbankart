<div align="center">
  <h2>🖥️ UrbanKart Client (Frontend)</h2>
  <p><strong>Modern React UI for E-Commerce</strong></p>
  <p>
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite" />
  </p>
</div>

---

### 🎨 Overview
This directory contains UrbanKart's React frontend foundation. Later approved stages will connect the shopping experience to the backend APIs.

### 🧩 Current structure and planned architecture
The Stage A frontend currently contains:
- **`src/components/layout/`**: the shared brand, header, footer, and page-width layout.
- **`src/components/ui/`**: reusable text-link and arrow primitives.
- **`src/pages/`**: the foundation preview and not-found page.
- **`src/styles/`**: design tokens and global, component, and page styles.
- **`src/config/`**: the public API base URL setting for a later API adapter.
- **`public/`**: the locally bundled UrbanKart mark.

Product, authentication, cart, and checkout pages; shared state providers; API hooks; and any corresponding assets are planned for later approved stages and are not present in this foundation.

### ⚡ Development Status
The Day 4 Stage A React/Vite foundation is in place. It contains a responsive editorial landing preview, shared layout components, global design tokens, accessible navigation defaults, and a browser-safe API base URL setting for future API integration. The product catalog is intentionally not connected yet; this stage includes no product, account, cart, or checkout workflows.

### Local setup

Requirements: Node.js 20.19+ (or 22.12+) and npm.

```powershell
cd client
npm install
npm run dev
```

Vite prints the local preview URL, normally `http://localhost:5173`. Build the static application with `npm run build`; inspect that build locally with `npm run preview`.

### Environment configuration

Copy `.env.example` to `.env.local` only if you need to change the API base URL:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

This value is public browser configuration. Never put passwords, JWT secrets, database URIs, or other private values in `VITE_` variables. The Stage A app records this setting in `src/config/environment.js`; no HTTP client or backend request is wired yet.

### Stage A foundation

- React 19, Vite 8, React Router, and the Vite React plugin, as declared in `package.json`.
- `public/urbankart-mark.svg`: the locally bundled text-brand companion mark.

The preview uses a locally rendered abstract illustration and does not imply that it is a product photograph or an official logo. It has no mock catalog data or nonfunctional search, account, or cart controls. Product browsing, authentication, shared cart state, and checkout are reserved for later approved stages.
