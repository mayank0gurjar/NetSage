import { GoogleGenerativeAI } from "@google/generative-ai";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

// Execute the Python rule checker as a subprocess
export function runPythonChecker(caseData) {
  return new Promise((resolve) => {
    // Determine path to checker.py relative to project root
    const checkerPath = path.join(process.cwd(), "src", "checker.py");
    
    // Spawn python process
    const pythonProcess = spawn("python", [checkerPath]);
    
    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}. Stderr: ${stderr}`);
        resolve({ status: "PASS", errors: [] });
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        console.error("Failed to parse Python checker stdout:", stdout, err);
        resolve({ status: "PASS", errors: [] });
      }
    });

    // Write input data and close stdin
    pythonProcess.stdin.write(JSON.stringify(caseData));
    pythonProcess.stdin.end();
  });
}

// Perform LLM diagnostics using Gemini API
export async function runLlmDiagnostics(caseData) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please set it in your .env file.");
  }

  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  // Read system prompt from diagnose_prompt.md
  const promptPath = path.join(process.cwd(), "prompts", "diagnose_prompt.md");
  let systemPrompt = "";
  try {
    systemPrompt = await fs.readFile(promptPath, "utf-8");
  } catch (err) {
    console.error("Warning: Could not read prompts/diagnose_prompt.md, using default system prompt.", err);
    systemPrompt = "You are a Cisco network troubleshooting assistant. Please diagnose the following case and output a JSON response.";
  }

  const userPrompt = `
Analyze this Cisco Packet Tracer troubleshooting case:

Symptom: ${caseData.symptom}
Topology Note: ${caseData.topology_note}
CLI Show-Command Outputs:
${caseData.show_outputs}
`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const responseText = result.response.text();
    
    // Find the JSON block if it has markdown tags, otherwise parse it directly
    let cleanJsonStr = responseText.trim();
    if (cleanJsonStr.startsWith("```json")) {
      cleanJsonStr = cleanJsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanJsonStr.startsWith("```")) {
      cleanJsonStr = cleanJsonStr.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const diagnosis = JSON.parse(cleanJsonStr);
    return {
      source: "llm",
      ...diagnosis
    };
  } catch (err) {
    console.error("Gemini API call failed:", err);
    throw err;
  }
}

// Perform hybrid check: run Python checker first, fall back to LLM if no rules match
export async function diagnoseCase(caseData) {
  // 1. Run Python checker
  const checkerResult = await runPythonChecker(caseData);
  
  if (checkerResult.status === "ERRORS_DETECTED" && checkerResult.errors.length > 0) {
    // Found deterministic error! Map it to the standard response schema
    const ruleError = checkerResult.errors[0];
    
    // Attempt to map rules to appropriate OSI Layers
    let osiLayer = "Layer 3"; // Default
    if (["INTERFACE_ADMIN_DOWN", "VLAN_PRUNED_FROM_TRUNK", "TRUNK_CONFIGURED_AS_ACCESS", "WRONG_ACCESS_VLAN", "NATIVE_VLAN_MISMATCH"].includes(ruleError.rule_id)) {
      osiLayer = "Layer 2";
    } else if (["DHCP_POOL_EXHAUSTED", "MISSING_DHCP_HELPER", "GATEWAY_IP_MISCONFIGURED"].includes(ruleError.rule_id)) {
      osiLayer = "Layer 7";
    }
    
    return {
      source: "rule_checker",
      root_cause: ruleError.description,
      osi_layer: osiLayer,
      confidence: "high",
      evidence: ruleError.evidence,
      next_command: "none",
      fix_steps: ruleError.fix
    };
  }
  
  // 2. Fallback to LLM if no deterministic errors found
  return await runLlmDiagnostics(caseData);
}
