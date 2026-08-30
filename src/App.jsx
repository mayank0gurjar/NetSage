import React, { useState, useEffect } from "react";
import {
  Activity,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Filter,
  Server,
  BookOpen,
  ArrowRight,
  Edit3,
  BarChart3,
  RefreshCw,
  FileText,
  Copy,
  Cpu,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from "lucide-react";

const osiDescriptions = {
  "Layer 2":
    "Handles local frame switching and VLAN trunking. Issues are usually wrong port assignments, native VLAN mismatches, or missing trunk configurations.",
  "Layer 3":
    "Manages packet routing and IP addressing. Issues are usually incorrect default gateways, overlapping subnets, or missing route advertisements.",
  "Layer 4":
    "Controls port-to-port connections and transport protocols. Issues are usually access control lists (ACLs) blocking specific port traffic (e.g., HTTP/80 or HTTPS/443).",
  "Layer 7":
    "Applies to application services (like DHCP or DNS). Issues are usually DHCP IP pool exhaustion, missing helper addresses, or inactive DNS configurations.",
};

export default function App() {
  // Navigation
  const [dashboardMode, setDashboardMode] = useState(false); // false = Hub, true = Metrics

  // Custom case creation form states
  const [showAddCaseForm, setShowAddCaseForm] = useState(false);
  const [newSymptom, setNewSymptom] = useState("");
  const [newTopology, setNewTopology] = useState("");
  const [newShowOutputs, setNewShowOutputs] = useState("");
  const [newConcept, setNewConcept] = useState("VLAN");
  const [newSeverity, setNewSeverity] = useState("Medium");
  const [newOsi, setNewOsi] = useState("Layer 3");
  const [savingCase, setSavingCase] = useState(false);

  // Noob UI toggles
  const [showFilters, setShowFilters] = useState(false);
  const [showCliOutput, setShowCliOutput] = useState(false);

  // Data State
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOsi, setFilterOsi] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Diagnostics & Auditing State
  const [caseStates, setCaseStates] = useState({}); // Stores { caseId: { diagnosed: true, result: {...}, reviewed: true/false, decision: 'accepted', finalFix: '...' } }
  const [diagnosing, setDiagnosing] = useState(false);
  const [submittingAudit, setSubmittingAudit] = useState(false);
  const [customFix, setCustomFix] = useState("");
  const [auditComments, setAuditComments] = useState("");
  const [copied, setCopied] = useState(false);

  // Metrics Dashboard Data
  const [metrics, setMetrics] = useState({
    agreementRate: 76.6,
    totalReviewed: 5,
    acceptedCount: 0,
    editedCount: 5,
    rejectedCount: 0,
    overrides: [],
  });

  // Load cases on mount
  useEffect(() => {
    fetchCases();
    fetchMetrics();
  }, []);

  // Fetch all cases from API
  const fetchCases = async () => {
    try {
      const res = await fetch("/api/cases");
      if (!res.ok) throw new Error("Failed to fetch cases");
      const data = await res.json();
      setCases(data);
    } catch (err) {
      console.error("Error fetching cases:", err);
    }
  };

  // Fetch metrics/logs from API
  const fetchMetrics = async () => {
    try {
      const res = await fetch("/api/metrics");
      if (!res.ok) throw new Error("Failed to fetch metrics");
      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      console.error("Error fetching metrics:", err);
    }
  };

  // Save new network case to database
  const saveNewCase = async (e) => {
    e.preventDefault();
    if (!newSymptom || !newShowOutputs) {
      alert("Please provide at least reported symptom and CLI show outputs.");
      return;
    }

    setSavingCase(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptom: newSymptom,
          topology_note: newTopology,
          show_outputs: newShowOutputs,
          concept_tag: newConcept,
          severity: newSeverity,
          osi_layer: newOsi,
        }),
      });

      if (!res.ok) throw new Error("Failed to save new case");
      const result = await res.json();

      // Reload cases
      const fetchRes = await fetch("/api/cases");
      const casesData = await fetchRes.json();
      setCases(casesData);

      // Select the newly created case
      const createdCase = casesData.find((c) => c.case_id === result.case_id);
      if (createdCase) {
        setSelectedCase(createdCase);
      }

      // Reset form states
      setNewSymptom("");
      setNewTopology("");
      setNewShowOutputs("");
      setNewConcept("VLAN");
      setNewSeverity("Medium");
      setNewOsi("Layer 3");
      setShowAddCaseForm(false);
    } catch (err) {
      alert(`Error saving custom case: ${err.message}`);
    } finally {
      setSavingCase(false);
    }
  };

  // Switch active case
  const handleSelectCase = (c) => {
    if (selectedCase && selectedCase.case_id === c.case_id) {
      setSelectedCase(null);
      setCustomFix("");
      setAuditComments("");
    } else {
      setSelectedCase(c);
      const existingState = caseStates[c.case_id];
      if (existingState && existingState.diagnosed) {
        setCustomFix(existingState.finalFix || existingState.result.fix_steps);
        setAuditComments(existingState.comments || "");
      } else {
        setCustomFix("");
        setAuditComments("");
      }
    }
  };

  // Run Hybrid Diagnostic Check
  const runDiagnostics = async () => {
    if (!selectedCase) return;
    setDiagnosing(true);

    try {
      const res = await fetch(`/api/diagnose/${selectedCase.case_id}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Diagnostic failed");
      const result = await res.json();

      setCaseStates((prev) => ({
        ...prev,
        [selectedCase.case_id]: {
          diagnosed: true,
          result: result,
          reviewed: false,
          decision: null,
          finalFix: result.fix_steps,
          comments: "",
        },
      }));
      setCustomFix(result.fix_steps);
      setAuditComments("");
    } catch (err) {
      alert(`Diagnostic Error: ${err.message}`);
    } finally {
      setDiagnosing(false);
    }
  };

  // Submit Audit Review
  const submitAudit = async (decision) => {
    if (!selectedCase) return;
    const caseState = caseStates[selectedCase.case_id];
    if (!caseState || !caseState.diagnosed) return;

    setSubmittingAudit(true);
    const auditData = {
      caseId: selectedCase.case_id,
      diagnosisSource: caseState.result.source,
      severity: selectedCase.severity,
      decision: decision, // 'accepted', 'edited', 'rejected'
      originalFix: caseState.result.fix_steps,
      finalFix: decision === "rejected" ? "" : customFix,
      comments:
        auditComments ||
        (decision === "accepted"
          ? "Approved as suggested."
          : "No comments provided."),
    };

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auditData),
      });

      if (!res.ok) throw new Error("Failed to log audit review");
      const result = await res.json();

      // Update case states local cache
      setCaseStates((prev) => ({
        ...prev,
        [selectedCase.case_id]: {
          ...prev[selectedCase.case_id],
          reviewed: true,
          decision: decision,
          finalFix: auditData.finalFix,
          comments: auditData.comments,
        },
      }));

      // Refresh stats
      fetchMetrics();
    } catch (err) {
      alert(`Audit Submit Error: ${err.message}`);
    } finally {
      setSubmittingAudit(false);
    }
  };

  // Helper: check status of case
  const getCaseStatus = (caseId) => {
    const state = caseStates[caseId];
    if (!state) return "pending";
    if (state.reviewed) return state.decision;
    if (state.diagnosed) return "diagnosed";
    return "pending";
  };

  // Filtering Logic
  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      c.case_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.symptom.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.concept_tag.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesOsi =
      filterOsi === "all" ||
      c.osi_layer.toLowerCase().includes(filterOsi.toLowerCase());
    const matchesSeverity =
      filterSeverity === "all" ||
      c.severity.toLowerCase() === filterSeverity.toLowerCase();

    const status = getCaseStatus(c.case_id);
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "pending" && status === "pending") ||
      (filterStatus === "diagnosed" && status === "diagnosed") ||
      (filterStatus === "accepted" && status === "accepted") ||
      (filterStatus === "edited" && status === "edited") ||
      (filterStatus === "rejected" && status === "rejected");

    return matchesSearch && matchesOsi && matchesSeverity && matchesStatus;
  });

  const activeCaseState = selectedCase
    ? caseStates[selectedCase.case_id]
    : null;

  return (
    <div className="app-container">
      {/* Header / Navbar */}
      <header className="header-container">
        <div className="flex-row-center" style={{ gap: "12px" }}>
          <div
            style={{
              position: "relative",
              padding: "8px",
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.15)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Activity className="w-5 h-5 text-indigo-400" />
            <div
              style={{
                position: "absolute",
                top: "-2px",
                right: "-2px",
                width: "8px",
                height: "8px",
                backgroundColor: "var(--state-success)",
                borderRadius: "50%",
                boxShadow: "0 0 8px var(--state-success)",
              }}
            />
          </div>
          <div>
            <h1
              style={{
                fontSize: "18px",
                fontWeight: "800",
                background: "linear-gradient(135deg, #818cf8 0%, #c084fc 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              NetSage AI
            </h1>
            <p
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                fontWeight: "500",
                marginTop: "1px",
              }}
            >
              Automated Network Diagnostic Platform
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="nav-tab-container">
          <button
            onClick={() => setDashboardMode(false)}
            className={`nav-tab ${!dashboardMode ? "nav-tab-active" : ""}`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Diagnostic Hub
          </button>
          <button
            onClick={() => setDashboardMode(true)}
            className={`nav-tab ${dashboardMode ? "nav-tab-active" : ""}`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Audit & Metrics
          </button>
        </div>

        {/* Server & API Status */}
        <div className="flex-row-center" style={{ gap: "12px" }}>
          <div
            className="flex-row-center"
            style={{
              padding: "6px 12px",
              background: "rgba(30, 210, 100, 0.05)",
              border: "1px solid rgba(30, 210, 100, 0.15)",
              borderRadius: "50px",
              fontSize: "11px",
              color: "var(--state-success)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "6px",
                height: "6px",
                backgroundColor: "var(--state-success)",
                borderRadius: "50%",
                marginRight: "4px",
              }}
            />
            <span>Active Agent</span>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="main-content">
        {!dashboardMode ? (
          /* DIAGNOSTIC HUB MODE */
          <div className="hub-layout">
            {/* LEFT SIDEBAR: CASE SELECTOR & FILTERS */}
            <section className="sidebar">
              <div
                className="glass-panel flex-col"
                style={{ padding: "16px", gap: "12px" }}
              >
                <h2
                  className="flex-row-center"
                  style={{
                    fontSize: "13px",
                    fontWeight: "700",
                    color: "var(--accent-primary)",
                    gap: "6px",
                    width: "100%",
                    justifyContent: "space-between",
                  }}
                >
                  <span className="flex-row-center" style={{ gap: "6px" }}>
                    <BookOpen className="w-4 h-4" />
                    Troubleshooting Cases
                  </span>
                  <button
                    onClick={() => {
                      setShowAddCaseForm(true);
                      setSelectedCase(null);
                    }}
                    className="btn-primary"
                    style={{
                      padding: "4px 8px",
                      fontSize: "10px",
                      borderRadius: "6px",
                      boxShadow: "none",
                    }}
                    title="Add custom case"
                  >
                    + New Case
                  </button>
                </h2>

                {/* Search input */}
                <div className="search-input-wrapper">
                  <Search className="w-4 h-4 search-icon" />
                  <input
                    type="text"
                    placeholder="Search ID, symptom..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowAddCaseForm(false);
                    }}
                  />
                </div>

                {/* Collapsible Filters Toggle */}
                <div className="flex-col">
                  <button
                    type="button"
                    onClick={() => setShowFilters(!showFilters)}
                    className="filter-toggle-btn"
                  >
                    <span className="flex-row-center" style={{ gap: "4px" }}>
                      <Filter className="w-3.5 h-3.5" />
                      Filter cases by parameters
                    </span>
                    {showFilters ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <div
                    className={`filter-drawer ${showFilters ? "filter-drawer-open" : ""}`}
                  >
                    <div className="grid-2-cols">
                      <div className="input-group">
                        <label className="input-label">OSI Layer</label>
                        <select
                          value={filterOsi}
                          onChange={(e) => setFilterOsi(e.target.value)}
                        >
                          <option value="all">All Layers</option>
                          <option value="layer 2">Layer 2</option>
                          <option value="layer 3">Layer 3</option>
                          <option value="layer 4">Layer 4</option>
                          <option value="layer 7">Layer 7</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label className="input-label">Severity</label>
                        <select
                          value={filterSeverity}
                          onChange={(e) => setFilterSeverity(e.target.value)}
                        >
                          <option value="all">All</option>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </div>
                    </div>

                    <div className="input-group" style={{ marginTop: "4px" }}>
                      <label className="input-label">Review Status</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                      >
                        <option value="all">All States</option>
                        <option value="pending">Pending (Un-diagnosed)</option>
                        <option value="diagnosed">
                          Diagnosed (Un-reviewed)
                        </option>
                        <option value="accepted">Accepted (Approved)</option>
                        <option value="edited">Edited (Revised)</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Case Cards Scrollable List */}
              <div className="case-list-container">
                {filteredCases.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "20px 0",
                      color: "var(--text-muted)",
                      fontSize: "13px",
                    }}
                  >
                    No cases match the filters.
                  </div>
                ) : (
                  filteredCases.map((c) => {
                    const isSelected =
                      selectedCase && selectedCase.case_id === c.case_id;
                    const status = getCaseStatus(c.case_id);

                    return (
                      <div
                        key={c.case_id}
                        onClick={() => handleSelectCase(c)}
                        className={`case-card glass-panel-interactive ${isSelected ? "case-card-selected" : ""}`}
                      >
                        <div className="case-card-header">
                          <span className="case-card-id">{c.case_id}</span>
                          <span
                            className={`badge ${
                              c.severity.toLowerCase() === "high"
                                ? "badge-high"
                                : c.severity.toLowerCase() === "medium"
                                  ? "badge-medium"
                                  : "badge-low"
                            }`}
                            style={{ padding: "2px 8px", fontSize: "9px" }}
                          >
                            {c.severity}
                          </span>
                        </div>
                        <h4 className="case-card-title">{c.symptom}</h4>
                        <div className="case-card-footer">
                          <span
                            style={{
                              color: "var(--accent-secondary)",
                              fontWeight: "600",
                            }}
                          >
                            {c.concept_tag}
                          </span>
                          <div
                            className="flex-row-center"
                            style={{ gap: "4px" }}
                          >
                            {status === "accepted" && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            {status === "edited" && (
                              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                            )}
                            {status === "rejected" && (
                              <XCircle className="w-3.5 h-3.5 text-rose-400" />
                            )}
                            {status === "diagnosed" && (
                              <Cpu
                                className="w-3.5 h-3.5 text-indigo-400"
                                style={{ animation: "spin 2s linear infinite" }}
                              />
                            )}
                            <span
                              style={{
                                textTransform: "capitalize",
                                fontSize: "9.5px",
                                fontWeight: "600",
                              }}
                            >
                              {status}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* CENTRAL WORKSPACE AREA */}
            <section className="details-panel">
              {showAddCaseForm ? (
                /* ADD NEW CASE FORM */
                <form
                  onSubmit={saveNewCase}
                  className="flex-col fade-in"
                  style={{ gap: "16px" }}
                >
                  <div
                    className="glass-panel flex-row-between"
                    style={{ padding: "16px 20px" }}
                  >
                    <div>
                      <h2
                        style={{
                          fontSize: "18px",
                          fontWeight: "800",
                          color: "var(--accent-primary)",
                        }}
                      >
                        Add Custom Network Ticket
                      </h2>
                      <p
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          marginTop: "4px",
                        }}
                      >
                        Input live Cisco Packet Tracer symptoms and show command
                        configurations.
                      </p>
                    </div>
                  </div>

                  <div
                    className="glass-panel flex-col"
                    style={{ padding: "16px", gap: "12px" }}
                  >
                    <div className="input-group">
                      <label className="input-label">
                        Reported Symptom (Required)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Host cannot ping gateway; DHCP relay fails"
                        value={newSymptom}
                        onChange={(e) => setNewSymptom(e.target.value)}
                        required
                      />
                    </div>

                    <div className="input-group">
                      <label className="input-label">
                        Network Topology Details / Notes
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., PC1 Fa0/1 connected to SW1; DHCP server on R1"
                        value={newTopology}
                        onChange={(e) => setNewTopology(e.target.value)}
                      />
                    </div>

                    <div className="input-group">
                      <label className="input-label">
                        Captured CLI Show Command Outputs (Required)
                      </label>
                      <textarea
                        placeholder="e.g., show running-config, show ip route, show interfaces..."
                        value={newShowOutputs}
                        onChange={(e) => setNewShowOutputs(e.target.value)}
                        className="code-editor"
                        style={{
                          minHeight: "180px",
                          color: "var(--text-primary)",
                        }}
                        required
                      />
                    </div>

                    <div className="grid-3-cols">
                      <div className="input-group">
                        <label className="input-label">
                          Concept / Fault Tag
                        </label>
                        <select
                          value={newConcept}
                          onChange={(e) => setNewConcept(e.target.value)}
                        >
                          <option value="VLAN">VLAN</option>
                          <option value="Inter-VLAN Routing">
                            Inter-VLAN Routing
                          </option>
                          <option value="DHCP">DHCP</option>
                          <option value="DNS">DNS</option>
                          <option value="ACL">ACL</option>
                          <option value="NAT">NAT</option>
                          <option value="OSPF">OSPF</option>
                          <option value="Addressing">Addressing</option>
                          <option value="Switching">Switching</option>
                          <option value="Wireless">Wireless</option>
                          <option value="Static Routing">Static Routing</option>
                          <option value="Security">Security</option>
                          <option value="Subnetting">Subnetting</option>
                          <option value="HSRP">HSRP</option>
                          <option value="IPv6">IPv6</option>
                          <option value="CDP">CDP</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label className="input-label">OSI Layer</label>
                        <select
                          value={newOsi}
                          onChange={(e) => setNewOsi(e.target.value)}
                        >
                          <option value="Layer 2">Layer 2 (Data Link)</option>
                          <option value="Layer 3">Layer 3 (Network)</option>
                          <option value="Layer 4">Layer 4 (Transport)</option>
                          <option value="Layer 7">Layer 7 (Application)</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label className="input-label">Severity</label>
                        <select
                          value={newSeverity}
                          onChange={(e) => setNewSeverity(e.target.value)}
                        >
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                        </select>
                      </div>
                    </div>

                    <div
                      className="flex-row-between"
                      style={{
                        borderTop: "1px solid rgba(255,255,255,0.05)",
                        paddingTop: "12px",
                        marginTop: "4px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddCaseForm(false);
                          if (cases.length > 0) {
                            setSelectedCase(cases[0]);
                          }
                        }}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingCase}
                        className="btn-primary"
                        style={{ background: "var(--accent-gradient)" }}
                      >
                        {savingCase ? "Saving..." : "Save & Load Case"}
                      </button>
                    </div>
                  </div>
                </form>
              ) : selectedCase ? (
                <div className="flex-col fade-in" style={{ gap: "16px" }}>
                  {/* Case Info Header */}
                  <div
                    className="glass-panel flex-row-between"
                    style={{ padding: "16px 20px" }}
                  >
                    <div>
                      <div className="flex-row-center" style={{ gap: "10px" }}>
                        <span
                          className="case-card-id"
                          style={{ fontSize: "14px", padding: "4px 8px" }}
                        >
                          {selectedCase.case_id}
                        </span>
                        <h2 style={{ fontSize: "18px", fontWeight: "800" }}>
                          {selectedCase.concept_tag} Troubleshooting
                        </h2>
                      </div>
                      <p
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          marginTop: "4px",
                        }}
                      >
                        Default OSI Layer:{" "}
                        <strong style={{ color: "var(--text-secondary)" }}>
                          {selectedCase.osi_layer}
                        </strong>
                      </p>
                    </div>

                    <div>
                      <span
                        className={`badge ${
                          selectedCase.severity.toLowerCase() === "high"
                            ? "badge-high"
                            : selectedCase.severity.toLowerCase() === "medium"
                              ? "badge-medium"
                              : "badge-low"
                        }`}
                      >
                        {selectedCase.severity} Severity
                      </span>
                    </div>
                  </div>

                  {/* Guided Stepper / Step Timeline for Noob Onboarding */}
                  <div className="stepper-container">
                    <div
                      className={`step-item ${!activeCaseState?.diagnosed ? "step-item-active" : "step-item-done"}`}
                    >
                      <div className="step-number">
                        {!activeCaseState?.diagnosed ? "1" : "✓"}
                      </div>
                      <span>1. Analyze Config</span>
                    </div>
                    <div
                      className={`step-connector ${activeCaseState?.diagnosed ? "step-connector-done" : ""}`}
                    />

                    <div
                      className={`step-item ${activeCaseState?.diagnosed && !activeCaseState?.reviewed ? "step-item-active" : activeCaseState?.reviewed ? "step-item-done" : ""}`}
                    >
                      <div className="step-number">
                        {activeCaseState?.reviewed ? "✓" : "2"}
                      </div>
                      <span>2. Review Suggested Fix</span>
                    </div>
                    <div
                      className={`step-connector ${activeCaseState?.reviewed ? "step-connector-done" : ""}`}
                    />

                    <div
                      className={`step-item ${activeCaseState?.reviewed ? "step-item-done" : ""}`}
                    >
                      <div className="step-number">3</div>
                      <span>3. Deploy to Lab</span>
                    </div>
                  </div>

                  {/* Friendly Onboarding Explanation Card */}
                  <div
                    className="noob-help-card flex-col"
                    style={{ gap: "4px" }}
                  >
                    <div
                      className="flex-row-center"
                      style={{
                        gap: "6px",
                        fontWeight: "700",
                        color: "var(--accent-primary)",
                        fontSize: "11.5px",
                      }}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Conceptual Training Tip for junior engineers</span>
                    </div>
                    <p style={{ marginTop: "2px" }}>
                      <strong>
                        {selectedCase.osi_layer} Diagnostic Helper
                      </strong>
                      :{" "}
                      {osiDescriptions[selectedCase.osi_layer.split(" (")[0]] ||
                        "Evaluate network symptom to check configurations."}
                    </p>
                  </div>

                  {/* Symptom & Topology Description */}
                  <div className="grid-2-cols">
                    <div
                      className="glass-panel flex-col"
                      style={{ padding: "14px", gap: "6px" }}
                    >
                      <h3
                        className="input-label"
                        style={{ color: "var(--accent-primary)" }}
                      >
                        Reported Symptom
                      </h3>
                      <p
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "var(--text-primary)",
                        }}
                      >
                        {selectedCase.symptom}
                      </p>
                    </div>
                    <div
                      className="glass-panel flex-col"
                      style={{ padding: "14px", gap: "6px" }}
                    >
                      <h3
                        className="input-label"
                        style={{ color: "var(--accent-secondary)" }}
                      >
                        Topology Details
                      </h3>
                      <p
                        style={{
                          fontSize: "13px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {selectedCase.topology_note}
                      </p>
                    </div>
                  </div>

                  {/* Show Commands Code Block */}
                  <div className="cli-panel flex-col">
                    <div
                      className="cli-panel-header"
                      style={{
                        borderBottom: showCliOutput
                          ? "1px solid rgba(255, 255, 255, 0.05)"
                          : "none",
                        paddingBottom: showCliOutput ? "8px" : "0",
                        marginBottom: showCliOutput ? "10px" : "0",
                      }}
                    >
                      <h3
                        className="input-label flex-row-center"
                        style={{ gap: "6px" }}
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        Captured CLI Show Command Outputs
                      </h3>
                      <div className="flex-row-center" style={{ gap: "10px" }}>
                        <button
                          type="button"
                          onClick={() => setShowCliOutput(!showCliOutput)}
                          className="btn-secondary"
                          style={{
                            padding: "4px 10px",
                            fontSize: "10px",
                            borderRadius: "4px",
                          }}
                        >
                          {showCliOutput
                            ? "Hide Raw Outputs"
                            : "Show Raw Outputs"}
                        </button>
                        {showCliOutput && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                selectedCase.show_outputs,
                              );
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                            className="btn-secondary"
                            style={{
                              padding: "4px 10px",
                              fontSize: "10px",
                              borderRadius: "4px",
                            }}
                          >
                            <Copy
                              className="w-3 h-3"
                              style={{ marginRight: "4px" }}
                            />
                            {copied ? "Copied!" : "Copy"}
                          </button>
                        )}
                      </div>
                    </div>
                    {showCliOutput && (
                      <pre
                        className="cli-code"
                        style={{ animation: "fadeIn 0.25s ease" }}
                      >
                        {selectedCase.show_outputs}
                      </pre>
                    )}
                  </div>

                  {/* DIAGNOSTIC TRIGGER OR RESULTS VIEW */}
                  {!activeCaseState?.diagnosed ? (
                    /* Initial diagnostic trigger box */
                    <div
                      className="glass-panel empty-state"
                      style={{
                        margin: 0,
                        padding: "32px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          padding: "12px",
                          background: "rgba(99, 102, 241, 0.05)",
                          border: "1px solid rgba(99, 102, 241, 0.15)",
                          borderRadius: "50%",
                          marginBottom: "12px",
                        }}
                      >
                        <Cpu className="w-6 h-6 text-indigo-400" />
                      </div>
                      <h3
                        style={{
                          fontSize: "14px",
                          fontWeight: "700",
                          color: "var(--text-primary)",
                        }}
                      >
                        Run Automated Troubleshooting
                      </h3>
                      <p
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          maxWidth: "340px",
                          marginTop: "4px",
                          lineHeight: "1.5",
                        }}
                      >
                        Triggers deterministic script rules (`checker.py`) and
                        passes output to Gemini AI model for diagnostic
                        reasoning.
                      </p>
                      <button
                        onClick={runDiagnostics}
                        disabled={diagnosing}
                        className="btn-primary"
                        style={{ marginTop: "16px", minWidth: "150px" }}
                      >
                        {diagnosing ? (
                          <>
                            <RefreshCw
                              className="w-3.5 h-3.5"
                              style={{
                                animation: "spin 1s linear infinite",
                                marginRight: "6px",
                              }}
                            />
                            Analyzing Configs...
                          </>
                        ) : (
                          <>
                            Diagnose Network
                            <ArrowRight
                              className="w-3.5 h-3.5"
                              style={{ marginLeft: "6px" }}
                            />
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    /* Show diagnostic outcomes */
                    <div className="diagnostic-container">
                      {/* Analysis Header */}
                      <div
                        className="glass-panel flex-row-between"
                        style={{
                          padding: "10px 16px",
                          background: "rgba(30, 210, 100, 0.02)",
                          borderColor: "rgba(30, 210, 100, 0.2)",
                        }}
                      >
                        <div
                          className="flex-row-center"
                          style={{ gap: "6px", color: "var(--state-success)" }}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span
                            style={{ fontSize: "12.5px", fontWeight: "700" }}
                          >
                            Troubleshooting Diagnosis Generated
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            fontWeight: "700",
                            color: "var(--text-muted)",
                            background: "rgba(0,0,0,0.2)",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            border: "1px solid var(--border-light)",
                          }}
                        >
                          Engine Source:{" "}
                          <strong
                            style={{
                              color: "var(--accent-primary)",
                              textTransform: "uppercase",
                            }}
                          >
                            {activeCaseState.result.source}
                          </strong>
                        </div>
                      </div>

                      {/* Diagnostic Breakdown */}
                      <div
                        className="glass-panel flex-col"
                        style={{ padding: "16px", gap: "12px" }}
                      >
                        <div>
                          <h4
                            className="input-label"
                            style={{
                              color: "var(--text-muted)",
                              marginBottom: "4px",
                            }}
                          >
                            Root Cause Diagnosis
                          </h4>
                          <p
                            style={{
                              fontSize: "13px",
                              color: "var(--text-primary)",
                              lineHeight: "1.5",
                              fontWeight: "500",
                            }}
                          >
                            {activeCaseState.result.root_cause}
                          </p>
                        </div>

                        {/* Muted Parameter Tray */}
                        <div
                          className="flex-row"
                          style={{
                            gap: "16px",
                            borderTop: "1px solid rgba(255,255,255,0.03)",
                            paddingTop: "10px",
                            flexWrap: "wrap",
                            fontSize: "11px",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <div>
                            <span style={{ color: "var(--text-muted)" }}>
                              OSI Layer:{" "}
                            </span>
                            <strong style={{ color: "var(--text-primary)" }}>
                              {activeCaseState.result.osi_layer}
                            </strong>
                          </div>
                          <div>
                            <span style={{ color: "var(--text-muted)" }}>
                              Confidence:{" "}
                            </span>
                            <span
                              className={`badge ${
                                activeCaseState.result.confidence.toLowerCase() ===
                                "high"
                                  ? "badge-low"
                                  : activeCaseState.result.confidence.toLowerCase() ===
                                      "medium"
                                    ? "badge-medium"
                                    : "badge-high"
                              }`}
                              style={{ padding: "1px 5px", fontSize: "9px" }}
                            >
                              {activeCaseState.result.confidence}
                            </span>
                          </div>
                          {activeCaseState.result.next_command &&
                            activeCaseState.result.next_command !== "None" && (
                              <div>
                                <span style={{ color: "var(--text-muted)" }}>
                                  Next Command:{" "}
                                </span>
                                <code
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "10.5px",
                                    background: "rgba(0,0,0,0.2)",
                                    padding: "1px 4px",
                                    borderRadius: "3px",
                                    color: "var(--accent-primary)",
                                  }}
                                >
                                  {activeCaseState.result.next_command}
                                </code>
                              </div>
                            )}
                        </div>

                        {/* Collapsible Evidence Section */}
                        {activeCaseState.result.evidence && (
                          <div
                            style={{
                              borderTop: "1px solid rgba(255,255,255,0.03)",
                              paddingTop: "8px",
                            }}
                          >
                            <span
                              style={{
                                color: "var(--accent-primary)",
                                fontSize: "11px",
                                fontWeight: "600",
                              }}
                            >
                              🔑 Key Evidence:{" "}
                              <span
                                style={{
                                  color: "var(--text-secondary)",
                                  fontFamily: "var(--font-mono)",
                                  fontSize: "10.5px",
                                  fontWeight: "normal",
                                }}
                              >
                                "{activeCaseState.result.evidence}"
                              </span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Remediation Config Command Box */}
                      <div
                        className="glass-panel flex-col"
                        style={{ padding: "16px", gap: "12px" }}
                      >
                        <div
                          className="flex-row-between"
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                            paddingBottom: "8px",
                          }}
                        >
                          <h4
                            className="input-label flex-row-center"
                            style={{
                              gap: "6px",
                              color: "var(--accent-primary)",
                            }}
                          >
                            <Terminal className="w-3.5 h-3.5" />
                            Remediation Configuration Script (Cisco IOS)
                          </h4>
                          <span
                            style={{
                              fontSize: "10px",
                              color: "var(--text-muted)",
                              fontWeight: "500",
                            }}
                          >
                            Review & Edit Commands Below
                          </span>
                        </div>

                        <textarea
                          value={customFix}
                          onChange={(e) => setCustomFix(e.target.value)}
                          className="code-editor"
                          disabled={activeCaseState.reviewed}
                          placeholder="No configuration commands required."
                        />

                        {/* Audit Comments Input */}
                        {!activeCaseState.reviewed ? (
                          <div
                            className="input-group"
                            style={{ marginTop: "4px" }}
                          >
                            <label className="input-label">
                              Human Reviewer Comments / Justification
                            </label>
                            <input
                              type="text"
                              placeholder="e.g., Verified interface shut down, approved commands."
                              value={auditComments}
                              onChange={(e) => setAuditComments(e.target.value)}
                            />
                          </div>
                        ) : null}

                        {/* Noob Helper tooltips below inputs */}
                        {!activeCaseState.reviewed && (
                          <div
                            className="noob-tip flex-col"
                            style={{
                              gap: "4px",
                              background: "rgba(255,255,255,0.01)",
                              padding: "8px",
                              borderRadius: "6px",
                              border: "1px solid rgba(255,255,255,0.02)",
                              marginTop: "4px",
                            }}
                          >
                            <div
                              style={{
                                color: "var(--text-secondary)",
                                fontWeight: "700",
                                fontSize: "9px",
                                textTransform: "uppercase",
                              }}
                            >
                              Reviewer Choice Guide:
                            </div>
                            <div
                              className="flex-row-center"
                              style={{ gap: "4px", fontSize: "10px" }}
                            >
                              <span
                                style={{
                                  color: "var(--state-success)",
                                  fontWeight: "bold",
                                }}
                              >
                                Approve & Deploy
                              </span>{" "}
                              ➔{" "}
                              <span style={{ color: "var(--text-muted)" }}>
                                Accepts the fix exactly as recommended by the
                                AI.
                              </span>
                            </div>
                            <div
                              className="flex-row-center"
                              style={{ gap: "4px", fontSize: "10px" }}
                            >
                              <span
                                style={{
                                  color: "var(--state-warning)",
                                  fontWeight: "bold",
                                }}
                              >
                                Modify & Save
                              </span>{" "}
                              ➔{" "}
                              <span style={{ color: "var(--text-muted)" }}>
                                Let's you customize the configuration script
                                manually before saving.
                              </span>
                            </div>
                            <div
                              className="flex-row-center"
                              style={{ gap: "4px", fontSize: "10px" }}
                            >
                              <span
                                style={{
                                  color: "var(--state-danger)",
                                  fontWeight: "bold",
                                }}
                              >
                                Reject Fix
                              </span>{" "}
                              ➔{" "}
                              <span style={{ color: "var(--text-muted)" }}>
                                Flags the AI diagnosis as incorrect or
                                hallucinated.
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Actions Control Panel */}
                        <div
                          className="flex-row-between"
                          style={{
                            borderTop: "1px solid rgba(255,255,255,0.04)",
                            paddingTop: "12px",
                            marginTop: "4px",
                          }}
                        >
                          {activeCaseState.reviewed ? (
                            <div
                              className="flex-row-center"
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                background: "rgba(255,255,255,0.02)",
                                border: "1px solid var(--border-light)",
                                borderRadius: "8px",
                                gap: "12px",
                              }}
                            >
                              {activeCaseState.decision === "accepted" && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              )}
                              {activeCaseState.decision === "edited" && (
                                <Edit3 className="w-4 h-4 text-amber-400" />
                              )}
                              {activeCaseState.decision === "rejected" && (
                                <XCircle className="w-4 h-4 text-rose-400" />
                              )}
                              <div>
                                <h4
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: "700",
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  Deploy Decision Submitted as{" "}
                                  <span
                                    style={{
                                      textTransform: "uppercase",
                                      color:
                                        activeCaseState.decision === "accepted"
                                          ? "var(--state-success)"
                                          : activeCaseState.decision ===
                                              "edited"
                                            ? "var(--state-warning)"
                                            : "var(--state-danger)",
                                    }}
                                  >
                                    {activeCaseState.decision}
                                  </span>
                                </h4>
                                <p
                                  style={{
                                    fontSize: "11px",
                                    color: "var(--text-muted)",
                                    marginTop: "2px",
                                  }}
                                >
                                  Reviewer notes: "{activeCaseState.comments}"
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => submitAudit("rejected")}
                                disabled={submittingAudit}
                                className="btn-secondary btn-danger"
                                style={{ padding: "8px 16px" }}
                              >
                                <XCircle
                                  className="w-4 h-4"
                                  style={{ marginRight: "4px" }}
                                />
                                Reject Fix
                              </button>

                              <div
                                className="flex-row-center"
                                style={{ gap: "10px" }}
                              >
                                <button
                                  onClick={() => submitAudit("edited")}
                                  disabled={submittingAudit}
                                  className="btn-secondary"
                                  style={{
                                    padding: "8px 16px",
                                    color: "var(--state-warning)",
                                    borderColor: "rgba(240, 160, 20, 0.2)",
                                  }}
                                >
                                  <Edit3
                                    className="w-4 h-4"
                                    style={{ marginRight: "4px" }}
                                  />
                                  Modify & Save
                                </button>
                                <button
                                  onClick={() => submitAudit("accepted")}
                                  disabled={submittingAudit}
                                  className="btn-primary btn-success"
                                  style={{ padding: "8px 16px" }}
                                >
                                  <CheckCircle2
                                    className="w-4 h-4"
                                    style={{ marginRight: "4px" }}
                                  />
                                  Approve & Deploy
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="glass-panel flex-col"
                  style={{
                    padding: "40px 30px",
                    justifyContent: "center",
                    alignItems: "center",
                    textAlign: "center",
                    borderStyle: "dashed",
                    gap: "20px",
                    height: "100%",
                    margin: "20px",
                  }}
                >
                  <div
                    style={{
                      padding: "14px",
                      background: "rgba(59, 130, 246, 0.05)",
                      border: "1px solid rgba(59, 130, 246, 0.15)",
                      borderRadius: "100%",
                      width: "55px",
                      height: "55px",
                    }}
                  >
                    <Server className="w-8 h-8 text-blue-400" />
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: "700",
                        color: "var(--text-primary)",
                      }}
                    >
                      Welcome to NetSage Diagnostic Assistant
                    </h3>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        maxWidth: "440px",
                        marginTop: "6px",
                        lineHeight: "1.6",
                      }}
                    >
                      This interactive playground simplifies Cisco switch and
                      router troubleshooting. Follow the guide below to resolve
                      configuration errors:
                    </p>
                  </div>

                  <div
                    className="flex-col"
                    style={{
                      gap: "12px",
                      textAlign: "left",
                      maxWidth: "460px",
                      width: "100%",
                      background: "rgba(255, 255, 255, 0.01)",
                      padding: "16px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-light)",
                    }}
                  >
                    <div
                      className="flex-row"
                      style={{ gap: "10px", fontSize: "12px" }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          background: "rgba(59,130,246,0.1)",
                          color: "var(--accent-primary)",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: "bold",
                          flexShrink: 0,
                        }}
                      >
                        1
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        <strong style={{ color: "var(--text-primary)" }}>
                          Select a Case
                        </strong>{" "}
                        from the left sidebar panel (or click{" "}
                        <strong>+ New Case</strong> to paste your own Cisco
                        configurations).
                      </span>
                    </div>
                    <div
                      className="flex-row"
                      style={{ gap: "10px", fontSize: "12px" }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          background: "rgba(59,130,246,0.1)",
                          color: "var(--accent-primary)",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: "bold",
                          flexShrink: 0,
                        }}
                      >
                        2
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        Click the <strong>Diagnose Network</strong> button to
                        query regex rule checks and Gemini AI reasoning.
                      </span>
                    </div>
                    <div
                      className="flex-row"
                      style={{ gap: "10px", fontSize: "12px" }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          background: "rgba(59,130,246,0.1)",
                          color: "var(--accent-primary)",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: "bold",
                          flexShrink: 0,
                        }}
                      >
                        3
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        Review the suggestion, edit commands inside the script
                        editor if needed, and submit your decision.
                      </span>
                    </div>
                  </div>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    💡 Tip: Click <strong>Responsible AI Metrics</strong> in the
                    top bar to inspect model accuracy and human review override
                    rates!
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : (
          /* AUDIT & METRICS DASHBOARD MODE */
          <div className="metrics-layout">
            {/* Top Cards Row */}
            <div className="grid-4-cols">
              <div
                className="glass-panel flex-col"
                style={{
                  padding: "16px",
                  justifyContent: "center",
                  minHeight: "100px",
                }}
              >
                <span
                  className="input-label"
                  style={{ color: "var(--text-muted)" }}
                >
                  Total Cases Reviewed
                </span>
                <span
                  style={{
                    fontSize: "28px",
                    fontWeight: "800",
                    marginTop: "4px",
                  }}
                >
                  {metrics.totalReviewed}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--text-muted)",
                    marginTop: "2px",
                  }}
                >
                  Audited human overrides
                </span>
              </div>

              <div
                className="glass-panel flex-col"
                style={{ padding: "16px", justifyContent: "center" }}
              >
                <span
                  className="input-label"
                  style={{ color: "var(--text-muted)" }}
                >
                  Model Agreement Rate
                </span>
                <div
                  className="flex-row-center"
                  style={{
                    gap: "6px",
                    alignItems: "baseline",
                    marginTop: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "28px",
                      fontWeight: "800",
                      color: "var(--accent-primary)",
                    }}
                  >
                    {metrics.agreementRate}%
                  </span>
                  <span
                    style={{ fontSize: "10px", color: "var(--text-muted)" }}
                  >
                    (Target &gt;75%)
                  </span>
                </div>
                {/* Visual agreement gauge */}
                <div
                  style={{
                    width: "100%",
                    height: "4px",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    borderRadius: "10px",
                    overflow: "hidden",
                    marginTop: "10px",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      background: "var(--accent-gradient)",
                      width: `${metrics.agreementRate}%`,
                      borderRadius: "10px",
                    }}
                  />
                </div>
              </div>

              <div
                className="glass-panel flex-col col-span-2"
                style={{ padding: "16px", justifyContent: "center" }}
              >
                <span
                  className="input-label"
                  style={{ color: "var(--text-muted)" }}
                >
                  Review Decision Outcomes
                </span>
                <div
                  className="flex-row-center"
                  style={{ gap: "28px", marginTop: "6px" }}
                >
                  <div className="flex-col">
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "var(--state-success)",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: "6px",
                          height: "6px",
                          backgroundColor: "var(--state-success)",
                          borderRadius: "50%",
                        }}
                      />
                      Approved
                    </span>
                    <span
                      style={{
                        fontSize: "20px",
                        fontWeight: "800",
                        marginTop: "2px",
                      }}
                    >
                      {metrics.acceptedCount}
                    </span>
                  </div>
                  <div
                    className="flex-col"
                    style={{
                      borderLeft: "1px solid rgba(255,255,255,0.05)",
                      paddingLeft: "24px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "var(--state-warning)",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: "6px",
                          height: "6px",
                          backgroundColor: "var(--state-warning)",
                          borderRadius: "50%",
                        }}
                      />
                      Modified
                    </span>
                    <span
                      style={{
                        fontSize: "20px",
                        fontWeight: "800",
                        marginTop: "2px",
                      }}
                    >
                      {metrics.editedCount}
                    </span>
                  </div>
                  <div
                    className="flex-col"
                    style={{
                      borderLeft: "1px solid rgba(255,255,255,0.05)",
                      paddingLeft: "24px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "var(--state-danger)",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: "6px",
                          height: "6px",
                          backgroundColor: "var(--state-danger)",
                          borderRadius: "50%",
                        }}
                      />
                      Rejected
                    </span>
                    <span
                      style={{
                        fontSize: "20px",
                        fontWeight: "800",
                        marginTop: "2px",
                      }}
                    >
                      {metrics.rejectedCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Log Entries List */}
            <div
              className="glass-panel flex-col"
              style={{ padding: "20px", gap: "16px" }}
            >
              <div
                className="flex-row-between"
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  paddingBottom: "12px",
                }}
              >
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: "800" }}>
                    Responsible AI Audit Log History
                  </h3>
                  <p
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      marginTop: "2px",
                    }}
                  >
                    Live audit feed of human-in-the-loop oversight actions and
                    override reasons.
                  </p>
                </div>
                <button
                  onClick={fetchMetrics}
                  className="btn-secondary"
                  style={{
                    padding: "6px 12px",
                    fontSize: "11px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <RefreshCw className="w-3 h-3" />
                  Sync Table
                </button>
              </div>

              <div className="audit-table-wrapper">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th style={{ width: "80px" }}>Time</th>
                      <th style={{ width: "90px" }}>Case ID</th>
                      <th style={{ width: "90px" }}>Source</th>
                      <th style={{ width: "80px" }}>Severity</th>
                      <th style={{ width: "90px" }}>Decision</th>
                      <th>AI Suggested CLI Fix</th>
                      <th>Final Deploy CLI Fix</th>
                      <th>Reviewer Comments / Override Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.overrides.length === 0 ? (
                      <tr>
                        <td
                          colSpan="8"
                          style={{
                            textAlign: "center",
                            padding: "20px 0",
                            color: "var(--text-muted)",
                          }}
                        >
                          No reviews logged yet.
                        </td>
                      </tr>
                    ) : (
                      metrics.overrides.map((entry, index) => {
                        const showSuggested =
                          entry.originalFix &&
                          entry.originalFix !== "N/A" &&
                          entry.originalFix !== "null";
                        const showFinal =
                          entry.finalFix &&
                          entry.finalFix !== "N/A" &&
                          entry.finalFix !== "null";

                        return (
                          <tr key={index}>
                            <td
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "10px",
                                color: "var(--text-muted)",
                              }}
                            >
                              {new Date(entry.timestamp).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </td>
                            <td
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontWeight: "700",
                                color: "var(--accent-primary)",
                              }}
                            >
                              {entry.caseId}
                            </td>
                            <td
                              style={{
                                fontSize: "10px",
                                textTransform: "uppercase",
                                fontWeight: "700",
                                color: "var(--text-muted)",
                              }}
                            >
                              {entry.source}
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  entry.severity.toLowerCase() === "high"
                                    ? "badge-high"
                                    : entry.severity.toLowerCase() === "medium"
                                      ? "badge-medium"
                                      : "badge-low"
                                }`}
                                style={{
                                  padding: "2px 6px",
                                  fontSize: "8.5px",
                                }}
                              >
                                {entry.severity}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  entry.decision === "accepted" ||
                                  entry.decision === "approved"
                                    ? "badge-accepted"
                                    : entry.decision === "edited"
                                      ? "badge-edited"
                                      : "badge-rejected"
                                }`}
                                style={{
                                  padding: "2px 6px",
                                  fontSize: "8.5px",
                                }}
                              >
                                {entry.decision}
                              </span>
                            </td>
                            <td
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "10px",
                                color: "var(--text-muted)",
                                maxWidth: "180px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={entry.originalFix}
                            >
                              {showSuggested
                                ? entry.originalFix.replace(/\\n/g, " ")
                                : "N/A"}
                            </td>
                            <td
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "10px",
                                color: "var(--state-success)",
                                maxWidth: "180px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={entry.finalFix}
                            >
                              {showFinal
                                ? entry.finalFix.replace(/\\n/g, " ")
                                : "N/A"}
                            </td>
                            <td
                              style={{
                                fontSize: "11px",
                                color: "var(--text-secondary)",
                                maxWidth: "200px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={entry.comment}
                            >
                              {entry.comment}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
