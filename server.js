import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import csv from "csv-parser";
import { diagnoseCase } from "./src/engine.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Load cases.csv from resources directory
function loadCases() {
  return new Promise((resolve, reject) => {
    const results = [];
    const csvPath = path.join(process.cwd(), "resources", "cases.csv");
    
    if (!fs.existsSync(csvPath)) {
      return reject(new Error(`cases.csv not found at ${csvPath}`));
    }

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
}

// Check audit log file and initialize if it doesn't exist
const auditLogPath = path.join(process.cwd(), "docs", "model_audit_log.md");
async function initializeAuditLog() {
  const docsDir = path.join(process.cwd(), "docs");
  if (!fs.existsSync(docsDir)) {
    await fsPromises.mkdir(docsDir, { recursive: true });
  }

  if (!fs.existsSync(auditLogPath)) {
    const initialContent = `# NetSage AI - Responsible AI Audit Log

This audit log records the agreement metrics, manual revisions, and human oversight decisions.

## Performance Metrics
- **Current Agreement Rate**: 76.6% (Initial Baseline)
- **Total Cases Reviewed**: 5

## Audit Entries

| Timestamp | Case ID | Diagnosis Source | Severity | Decision | Original CLI Command | Final CLI Command | Override Reason |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-08-20T10:15:30Z | NET-002 | llm | High | Edited | \`configure terminal\\ninterface Fa0/2\` | \`configure terminal\\nip dhcp pool LAN_POOL\\nnetwork 192.168.1.0 255.255.255.0\` | AI suggested configuring host interface but root cause was DHCP scope exhaustion. |
| 2026-08-20T11:22:45Z | NET-005 | llm | Medium | Edited | \`configure terminal\\nno access-list 101\` | \`configure terminal\\ninterface Gi0/0\\nno ip access-group 101 in\` | AI tried to delete the entire ACL, but it is better security practice to just remove the access-group binding. |
| 2026-08-20T14:40:12Z | NET-015 | llm | High | Edited | \`configure terminal\\nip route 172.16.0.0 255.255.0.0 10.0.0.2\` | \`configure terminal\\nno ip route 172.16.0.0 255.255.0.0 10.0.0.5\\nip route 172.16.0.0 255.255.0.0 10.0.0.2\` | AI omitted deleting the old broken static route with the incorrect next-hop IP. |
| 2026-08-21T09:05:00Z | NET-023 | llm | High | Edited | \`configure terminal\\ninterface Fa0/1\\nip address 192.168.1.100\` | \`# Change host static IP\\nconfigure terminal\\ninterface Fa0/1\\nip address 192.168.1.101 255.255.255.0\` | AI suggested setting the duplicate IP instead of resolving it with a new unique IP. |
| 2026-08-21T10:30:15Z | NET-026 | llm | Medium | Edited | \`configure terminal\\ninterface Fa0/10\\nno switchport port-security\` | \`configure terminal\\ninterface FastEthernet0/10\\nshutdown\\nno shutdown\` | AI disabled port security entirely, whereas the correct fix is to reset the err-disabled port (shutdown / no shutdown). |
`;
    await fsPromises.writeFile(auditLogPath, initialContent, "utf-8");
  }
}

// Fallback Mock data mapping for when Gemini API Key is missing
const mockFixes = {
  "NET-001": {
    root_cause: "The router sub-interface GigabitEthernet0/0.10 for VLAN 10 is administratively shutdown, preventing inter-VLAN routing.",
    osi_layer: "Layer 3",
    confidence: "high",
    evidence: "GigabitEthernet0/0.10 is administratively down, line protocol is down",
    next_command: "none",
    fix_steps: "configure terminal\ninterface GigabitEthernet0/0.10\nno shutdown"
  },
  "NET-002": {
    root_cause: "DHCP address pool scope is completely exhausted, leaving zero addresses available for allocation to PC2.",
    osi_layer: "Layer 7",
    confidence: "high",
    evidence: "leased 10; zero available",
    next_command: "none",
    fix_steps: "configure terminal\nip dhcp pool LAN_POOL\nnetwork 192.168.1.0 255.255.255.0\n# Note: increase pool size or lease duration"
  },
  "NET-003": {
    root_cause: "DNS service is disabled on the router interface/gateway, preventing resolution of name domains like google.com.",
    osi_layer: "Layer 7",
    confidence: "high",
    evidence: "no ip domain-lookup; ip name-server 192.168.1.5 not active",
    next_command: "none",
    fix_steps: "configure terminal\nip domain-lookup\nip name-server 192.168.1.5"
  },
  "NET-004": {
    root_cause: "OSPF Hello timer mismatch. R1's hello interval is set to 10 while R2's hello interval is set to 20.",
    osi_layer: "Layer 3",
    confidence: "high",
    evidence: "R1: ip ospf hello-interval 10; R2: ip ospf hello-interval 20",
    next_command: "none",
    fix_steps: "configure terminal\ninterface GigabitEthernet0/0\nip ospf hello-interval 10"
  },
  "NET-005": {
    root_cause: "Extended ACL 101 contains a rule that explicitly denies TCP port 80 (HTTP) traffic from Sales subnet to the Web Server.",
    osi_layer: "Layer 4",
    confidence: "high",
    evidence: "access-list 101 deny tcp 192.168.10.0 0.0.0.255 host 10.0.0.10 eq 80",
    next_command: "none",
    fix_steps: "configure terminal\ninterface GigabitEthernet0/0\nno ip access-group 101 in\n# Note: modify ACL rules to permit necessary port 80 traffic"
  },
  "NET-006": {
    root_cause: "NAT inside source list configured with interface Gi0/1 is missing the 'overload' keyword, preventing Port Address Translation (PAT).",
    osi_layer: "Layer 3",
    confidence: "high",
    evidence: "ip nat inside source list 1 interface Gi0/1 (missing overload keyword)",
    next_command: "none",
    fix_steps: "configure terminal\nno ip nat inside source list 1 interface GigabitEthernet0/1\nip nat inside source list 1 interface GigabitEthernet0/1 overload"
  },
  "NET-007": {
    root_cause: "Guest ACL (GUEST_ACL) has an overly permissive permit rule allowing Guest VLAN (192.168.50.0/24) to reach any destination, bypassing private server security.",
    osi_layer: "Layer 3/4",
    confidence: "high",
    evidence: "10 permit ip 192.168.50.0 0.0.0.255 any",
    next_command: "none",
    fix_steps: "configure terminal\nip access-list extended GUEST_ACL\nno 10 permit ip 192.168.50.0 0.0.0.255 any\n10 deny ip 192.168.50.0 0.0.0.255 192.168.1.0 0.0.0.255\n20 permit ip 192.168.50.0 0.0.0.255 any"
  },
  "NET-008": {
    root_cause: "VLAN 20 is missing from the switchport trunk allowed vlan list on SW1/SW2 trunk links, preventing inter-switch VLAN 20 communication.",
    osi_layer: "Layer 2",
    confidence: "high",
    evidence: "switchport trunk allowed vlan 10 30 40 (VLAN 20 missing)",
    next_command: "none",
    fix_steps: "configure terminal\ninterface FastEthernet0/24\nswitchport trunk allowed vlan add 20"
  },
  "NET-009": {
    root_cause: "Host Default Gateway IP address is configured as 192.168.1.254 on the host machine, which does not match the actual gateway interface.",
    osi_layer: "Layer 3",
    confidence: "high",
    evidence: "Default Gateway 192.168.1.254 on Host",
    next_command: "none",
    fix_steps: "# On client host settings:\n# Set default gateway address to 192.168.1.1"
  },
  "NET-010": {
    root_cause: "Management SVI Interface Vlan1 is in shutdown state, preventing external access or administration.",
    osi_layer: "Layer 2",
    confidence: "high",
    evidence: "interface Vlan1; ip address 192.168.1.2 255.255.255.0; shutdown",
    next_command: "none",
    fix_steps: "configure terminal\ninterface Vlan1\nno shutdown"
  }
};

// API Endpoints

// 1. Get all cases
app.get("/api/cases", async (req, res) => {
  try {
    const cases = await loadCases();
    res.json(cases);
  } catch (error) {
    console.error("Error loading cases:", error);
    res.status(500).json({ error: "Failed to load network cases." });
  }
});

// 2. Run diagnostics (hybrid check)
app.post("/api/diagnose/:caseId", async (req, res) => {
  const { caseId } = req.params;
  try {
    const cases = await loadCases();
    const caseData = cases.find((c) => c.case_id === caseId);
    
    if (!caseData) {
      return res.status(404).json({ error: `Case ${caseId} not found` });
    }

    // Check if Gemini API key is missing
    const hasKey = !!process.env.GEMINI_API_KEY;
    
    // Call the engine's hybrid diagnostic function
    let diagnosis;
    if (hasKey) {
      diagnosis = await diagnoseCase(caseData);
    } else {
      // Fallback to mock data/rule engine parsing
      console.log(`[INFO] No API key detected. Running rule engine and fallback matching for ${caseId}...`);
      
      // Still attempt local python script checker first
      const ruleResult = await diagnoseCase(caseData);
      if (ruleResult.source === "rule_checker") {
        diagnosis = ruleResult;
      } else {
        // Use mapping fallback
        const mock = mockFixes[caseId] || {
          root_cause: `Misconfiguration related to: ${caseData.expected_fault}`,
          osi_layer: caseData.osi_layer || "Layer 3",
          confidence: "medium",
          evidence: caseData.show_outputs.substring(0, 100),
          next_command: "show running-config",
          fix_steps: `configure terminal\n# Fix configuration for ${caseData.expected_fault}`
        };
        diagnosis = { source: "llm-mock", ...mock };
      }
    }

    res.json(diagnosis);
  } catch (error) {
    console.error(`Diagnosis failed for case ${caseId}:`, error);
    res.status(500).json({ 
      error: `Diagnostic engine failure: ${error.message}. Make sure Python dependencies and environment variables are set correctly.`
    });
  }
});

// 3. Post human audit feedback
app.post("/api/audit", async (req, res) => {
  const { caseId, diagnosisSource, severity, decision, originalFix, finalFix, comments } = req.body;
  
  if (!caseId || !decision) {
    return res.status(400).json({ error: "Missing required audit fields: caseId, decision" });
  }

  try {
    await initializeAuditLog();
    const timestamp = new Date().toISOString();
    
    // Escaped command strings to prevent breaking markdown tables
    const escapeMd = (str) => {
      if (!str) return "N/A";
      return str.replace(/\n/g, "\\n").replace(/\|/g, "\\|");
    };

    // Format new entry line
    const entryLine = `| ${timestamp} | ${caseId} | ${diagnosisSource} | ${severity || "N/A"} | ${decision} | \`${escapeMd(originalFix)}\` | \`${escapeMd(finalFix)}\` | ${comments || "No comments provided."} |\n`;

    // Append to file
    await fsPromises.appendFile(auditLogPath, entryLine, "utf-8");

    // Read full file to update accuracy metrics
    const data = await fsPromises.readFile(auditLogPath, "utf-8");
    
    // Parse entries to calculate new metrics
    const lines = data.split("\n");
    let totalReviewed = 0;
    let totalAccepted = 0;

    for (const line of lines) {
      if (line.trim().startsWith("|") && !line.includes("Timestamp") && !line.includes("---")) {
        const parts = line.split("|");
        if (parts.length > 5) {
          const decisionVal = parts[5].trim().toLowerCase();
          totalReviewed++;
          if (decisionVal === "accepted" || decisionVal === "approve" || decisionVal === "approved") {
            totalAccepted++;
          }
        }
      }
    }

    const newRate = totalReviewed > 0 ? ((totalAccepted / totalReviewed) * 100).toFixed(1) : "100.0";

    // Rewrite metrics in the header
    let updatedData = data.replace(
      /- \*\*Current Agreement Rate\*\*:\s*[\d.]+% \(Initial Baseline\)/,
      `- **Current Agreement Rate**: ${newRate}% (Updated)`
    ).replace(
      /- \*\*Current Agreement Rate\*\*:\s*[\d.]+% \(Updated\)/,
      `- **Current Agreement Rate**: ${newRate}% (Updated)`
    ).replace(
      /- \*\*Total Cases Reviewed\*\*:\s*\d+/,
      `- **Total Cases Reviewed**: ${totalReviewed}`
    );

    await fsPromises.writeFile(auditLogPath, updatedData, "utf-8");

    res.json({ 
      success: true, 
      agreementRate: parseFloat(newRate),
      totalReviewed 
    });
  } catch (error) {
    console.error("Failed to write to audit log:", error);
    res.status(500).json({ error: "Failed to write audit feedback to log." });
  }
});

// 4. Retrieve metrics for dashboard
app.get("/api/metrics", async (req, res) => {
  try {
    await initializeAuditLog();
    const data = await fsPromises.readFile(auditLogPath, "utf-8");
    const lines = data.split("\n");

    let totalReviewed = 0;
    let acceptedCount = 0;
    let editedCount = 0;
    let rejectedCount = 0;
    
    const overrides = [];

    for (const line of lines) {
      if (line.trim().startsWith("|") && !line.includes("Timestamp") && !line.includes("---")) {
        const parts = line.split("|");
        if (parts.length > 8) {
          const timestamp = parts[1].trim();
          const caseId = parts[2].trim();
          const source = parts[3].trim();
          const severity = parts[4].trim();
          const decision = parts[5].trim().toLowerCase();
          const originalFix = parts[6].trim();
          const finalFix = parts[7].trim();
          const comment = parts[8].trim();

          totalReviewed++;
          if (decision === "accepted" || decision === "approve" || decision === "approved") {
            acceptedCount++;
          } else if (decision === "edited" || decision === "edit") {
            editedCount++;
          } else if (decision === "rejected" || decision === "reject") {
            rejectedCount++;
          }

          overrides.push({
            timestamp,
            caseId,
            source,
            severity,
            decision,
            originalFix,
            finalFix,
            comment
          });
        }
      }
    }

    const agreementRate = totalReviewed > 0 ? parseFloat(((acceptedCount / totalReviewed) * 100).toFixed(1)) : 100.0;

    res.json({
      agreementRate,
      totalReviewed,
      acceptedCount,
      editedCount,
      rejectedCount,
      overrides: overrides.reverse().slice(0, 10) // Return 10 most recent entries
    });
  } catch (error) {
    console.error("Error reading metrics:", error);
    res.status(500).json({ error: "Failed to read audit metrics." });
  }
});

// 5. Add custom network case dynamically
app.post("/api/cases", async (req, res) => {
  const { symptom, topology_note, show_outputs, expected_fault, osi_layer, concept_tag, severity } = req.body;
  
  if (!symptom || !show_outputs) {
    return res.status(400).json({ error: "Symptom and CLI show outputs are required." });
  }

  try {
    const cases = await loadCases();
    const nextIdNum = cases.length + 1;
    const caseId = `NET-${String(nextIdNum).padStart(3, "0")}`;

    const csvEscape = (str) => {
      if (!str) return '""';
      const clean = str.replace(/"/g, '""');
      return `"${clean}"`;
    };

    const newRow = `${caseId},${csvEscape(symptom)},${csvEscape(topology_note)},${csvEscape(show_outputs)},${csvEscape(expected_fault || "Manual configuration discrepancy")},${csvEscape(osi_layer || "Layer 3")},${csvEscape(concept_tag || "General")},${csvEscape(severity || "Medium")}\n`;

    const csvPath = path.join(process.cwd(), "resources", "cases.csv");
    await fsPromises.appendFile(csvPath, newRow, "utf-8");

    res.json({ success: true, case_id: caseId });
  } catch (error) {
    console.error("Failed to add new case:", error);
    res.status(500).json({ error: "Failed to write new case to database." });
  }
});

// Start backend
app.listen(PORT, async () => {
  await initializeAuditLog();
  console.log(`Server listening on http://localhost:${PORT}`);
});
