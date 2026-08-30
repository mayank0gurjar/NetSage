# NetSage AI - Network Troubleshooting Assistant

NetSage AI is an AI-assisted troubleshooting helper for Cisco-style network lab environments. It analyzes reported network symptoms and CLI show-command outputs, checks configurations using deterministic rules, queries Gemini AI for root-cause diagnosis, and manages a human-in-the-loop review pipeline before deploying fixes.

---

## System Architecture

The application is built using a hybrid architecture:
1.  **Frontend (React + Vite + Vanilla CSS)**: A dark-mode, glassmorphism-themed dashboard for case selection, filtering, diagnostic execution, and audit review tracking.
2.  **Backend (Node.js + Express)**: Handles CSV parsing, logs audit records, communicates with Gemini API, and spawns the Python rules runner.
3.  **Deterministic Rules (Python 3.13)**: Spawns `checker.py` as a subprocess to parse Cisco outputs using regular expressions (checking down interfaces, duplicate IPs, gateway errors, NAT, and OSPF mismatches).

---

## Getting Started

### Prerequisites
*   **Node.js (v22+)**
*   **Python (v3.10+)**

### Installation
1.  Open your terminal inside the root directory and install dependencies:
    ```bash
    npm install
    ```
    *(Note: If script execution is disabled on Windows PowerShell, run: `cmd /c npm install`)*

2.  Copy the environment variables template:
    ```bash
    copy .env.example .env
    ```

3.  Configure your Gemini API Key in the newly created `.env` file:
    ```env
    PORT=5000
    GEMINI_MODEL=gemini-1.5-flash
    GEMINI_API_KEY=your_gemini_api_key_here
    ```
    *Note: If no API key is provided, the system runs in **Mock Fallback Mode** using pre-configured mappings so you can test all features and workflows offline.*

### Running the Application
1.  Start the backend and frontend dev servers concurrently:
    ```bash
    npm run dev
    ```
    *(PowerShell fallback command: `cmd /c npm run dev`)*

2.  Access the dashboard in your web browser:
    *   **Frontend Dashboard**: [http://localhost:3000/](http://localhost:3000/)
    *   **Backend REST API**: [http://localhost:5000/api/cases](http://localhost:5000/api/cases)

---

## Submission Deliverables Location

*   **`cases.csv`**: Located in [`resources/cases.csv`](./resources/cases.csv). Stores the 30 active cases.
*   **`diagnose_prompt.md`**: Located in [`prompts/diagnose_prompt.md`](./prompts/diagnose_prompt.md). Defines system prompts and JSON schema specifications.
*   **`checker.py`**: Located in [`src/checker.py`](./src/checker.py). Deterministic regular expressions check scripts.
*   **Dashboard Application**: Handled by [`src/App.jsx`](./src/App.jsx) (UI) and [`server.js`](./server.js) (API).
*   **`model_audit_log.md`**: Located in [`docs/model_audit_log.md`](./docs/model_audit_log.md). Responsible AI override audit log.
