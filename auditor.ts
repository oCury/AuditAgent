#!/usr/bin/env node
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs-extra";
import path from "path";
import "dotenv/config";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    auditFolder: "./audits",
    doneFolder: "./audits/done",
    resultsFolder: "./results",
    rulesFile: "./cloud.md",
    geminiModel: "gemini-3-flash-preview"
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface Metadata {
    lead_id: string;
    lead_name: string;
    date_time_context: string;
}

interface Audit {
    verdict: "APPROVED" | "DIVERGENT";
    positive_highlights: string[];
    technical_divergences: string[];
    final_summary: string;
    critical_fail: boolean;
}

interface AuditResponse {
    metadata: Metadata;
    audit: Audit;
}

interface ImageAudit {
    filename: string;
    date_time_context: string;
    verdict: "APPROVED" | "DIVERGENT";
    positive_highlights: string[];
    technical_divergences: string[];
    final_summary: string;
    critical_fail: boolean;
    processed_at: string;
}

interface LeadCase {
    lead_id: string;
    lead_name: string;
    images: ImageAudit[];
    consolidated_verdict: "APPROVED" | "DIVERGENT" | "CRITICAL";
    has_critical_fail: boolean;
    all_positive_highlights: string[];
    all_technical_divergences: string[];
    detailed_justification: string;
    total_images: number;
    approved_count: number;
    divergent_count: number;
}

interface AuditStats {
    total_images: number;
    total_cases: number;
    approved_cases: number;
    divergent_cases: number;
    critical_cases: number;
    errors: number;
}

// ============================================================================
// ENVIRONMENT VALIDATION
// ============================================================================

function loadEnv(): string {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("❌ Missing environment variable: GEMINI_API_KEY");
        console.error("   Create a .env file with: GEMINI_API_KEY=your_key");
        process.exit(1);
    }

    return apiKey;
}

// ============================================================================
// GEMINI VISION ANALYZER
// ============================================================================

function buildPrompt(rules: string): string {
    return `You are a SENIOR AUDITOR CRITIC for R3 Academia's WhatsApp chatbot.
Your analysis must be SPECIFIC, DETAILED, and ACTIONABLE. No generic phrases.

BUSINESS RULES:
${rules}

═══════════════════════════════════════════════════════════════════════════════
PHASE 1: LEAD IDENTIFICATION (Vision-Driven)
═══════════════════════════════════════════════════════════════════════════════

1. LEAD ID:
   - Look at the TOP RIGHT or TOP LEFT of the screen for the Lead ID
   - It appears as "#" followed by numbers (e.g., #2559, #12345)
   - If not found, return "Unknown"

2. LEAD NAME:
   - Look at the CHAT HEADER for the contact name
   - Also check bot's greeting (e.g., "Olá, Maria!")
   - If not found, return "Unknown"

3. DATE/TIME CONTEXT:
   - Extract the conversation date and time range visible
   - Format: "DD/MM/YYYY HH:MM-HH:MM" or best available
   - If not found, return "Unknown"

═══════════════════════════════════════════════════════════════════════════════
PHASE 2: DEEP COMPLIANCE AUDIT
═══════════════════════════════════════════════════════════════════════════════

JUSTIFICATION DEPTH REQUIREMENT:
❌ DO NOT use generic phrases like "Followed rules" or "Good compliance"
✅ BE SPECIFIC: "Bot proactively mentioned the 90-day retention rule at 14:38 when the lead asked about cancellation procedures"

MULTI-IMAGE AWARENESS:
- Check if bot is REPEATING itself unnecessarily
- Check if bot is IGNORING previous lead inputs
- Note any conversation loops or redundant messages

STRUCTURAL ANALYSIS:

CHECK 1: VISUAL BUBBLE SEPARATION (Balão Rule)
- [[BALAO]] is a HIDDEN command - you won't see it as text
- VERIFY: Are bot responses split into MULTIPLE DISTINCT BUBBLES?
- ✅ PASS: Multiple separate bubbles for greeting, info, question
- ❌ FAIL: All content crammed into ONE large bubble

CHECK 2: SENTENCE LENGTH (1-3 Rule)
- Count sentences in EACH bot bubble
- ✅ PASS: 1-3 sentences per bubble maximum
- ❌ FAIL: 4+ sentences in a single bubble
- Be STRICT: Quote the exact bubble content that violates

CHECK 3: PAYMENT METHOD (CRITICAL)
- If bot mentions "PIX" or "Débito" for PLANS = critical_fail: true
- PIX only allowed for day passes, NEVER for monthly plans

CHECK 4: LINK INTENT VERIFICATION
- Registration links ONLY after explicit intent signals
- Valid: "quero assinar", "fecha pra mim", "me manda o link"
- Note the EXACT timestamp when link was sent vs when intent was shown

CHECK 5: CONTEXT & FLOW
- Pre-purchase cancellation: Must explain 90/30 day rule + ask plan preference
- Gympass/TotalPass: Must NOT send registration links
- Check for appropriate tone and personalization

═══════════════════════════════════════════════════════════════════════════════
PHASE 3: DETAILED OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

positive_highlights EXAMPLES (be this specific):
- "At 14:32, bot correctly split plan information into 3 separate bubbles"
- "Bot addressed lead by name 'Maria' in greeting, showing personalization"
- "Properly handled Gympass mention at 15:10 by confirming access without sending links"
- "Cancellation question at 09:45 received correct 90-day rule explanation"

technical_divergences EXAMPLES (include timestamp):
- "14:38: Single bubble contains 5 sentences describing both plans - exceeds 1-3 limit"
- "15:22: Registration link sent before lead expressed purchase intent"
- "16:01: Bot repeated the same plan information twice in consecutive messages"
- "11:45: PIX mentioned as payment option for monthly plan - CRITICAL VIOLATION"

final_summary REQUIREMENT:
Write a cohesive paragraph (3-5 sentences) that:
- States the overall verdict clearly
- Mentions specific positive behaviors observed
- Details any violations with timestamps
- Provides actionable feedback for improvement

═══════════════════════════════════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════════════════════════════════

Return ONLY raw JSON. No markdown. No backticks. No extra text.

{"metadata":{"lead_id":"#2559","lead_name":"Maria","date_time_context":"10/03/2026 14:30-14:45"},"audit":{"verdict":"APPROVED","positive_highlights":["specific point 1","specific point 2"],"technical_divergences":[],"final_summary":"Cohesive paragraph here.","critical_fail":false}}

FIELD RULES:
- metadata.lead_id: ID with # prefix or "Unknown"
- metadata.lead_name: Name from chat or "Unknown"
- metadata.date_time_context: Date/time range or "Unknown"
- audit.verdict: "APPROVED" if all checks pass, "DIVERGENT" if any violation
- audit.positive_highlights: Array of SPECIFIC positive observations with timestamps
- audit.technical_divergences: Array of SPECIFIC violations with timestamps (empty if APPROVED)
- audit.final_summary: Detailed paragraph justifying the verdict
- audit.critical_fail: true ONLY if PIX/Débito for plans detected`;
}

async function analyzeImage(
    genAI: GoogleGenerativeAI,
    imageBuffer: Buffer,
    rules: string
): Promise<AuditResponse> {
    const model = genAI.getGenerativeModel({ model: CONFIG.geminiModel });
    const prompt = buildPrompt(rules);

    const result = await model.generateContent([
        prompt,
        { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/png" } }
    ]);

    const text = result.response.text().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text) as AuditResponse;

    if (!parsed.metadata) {
        parsed.metadata = { lead_id: "Unknown", lead_name: "Unknown", date_time_context: "Unknown" };
    }
    parsed.metadata.lead_id = parsed.metadata.lead_id || "Unknown";
    parsed.metadata.lead_name = parsed.metadata.lead_name || "Unknown";
    parsed.metadata.date_time_context = parsed.metadata.date_time_context || "Unknown";

    if (!parsed.audit) {
        parsed.audit = {
            verdict: "DIVERGENT",
            positive_highlights: [],
            technical_divergences: ["Parsing error"],
            final_summary: "Unable to parse audit response",
            critical_fail: false
        };
    }
    parsed.audit.positive_highlights = parsed.audit.positive_highlights || [];
    parsed.audit.technical_divergences = parsed.audit.technical_divergences || [];
    parsed.audit.final_summary = parsed.audit.final_summary || "";

    return parsed;
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

async function getImageFiles(folder: string): Promise<string[]> {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    return entries
        .filter(e => e.isFile() && /\.(png|jpg|jpeg)$/i.test(e.name))
        .map(e => e.name);
}

async function moveToProcessed(source: string, destFolder: string): Promise<void> {
    const filename = path.basename(source);
    const dest = path.join(destFolder, filename);
    await fs.move(source, dest, { overwrite: true });
}

// ============================================================================
// LEAD CASE AGGREGATION
// ============================================================================

function aggregateLeadCases(imageAudits: Map<string, { name: string; audits: ImageAudit[] }>): LeadCase[] {
    const cases: LeadCase[] = [];

    for (const [leadId, data] of imageAudits) {
        const { name, audits } = data;
        
        const hasCritical = audits.some(a => a.critical_fail);
        const hasDivergent = audits.some(a => a.verdict === "DIVERGENT");
        const approvedCount = audits.filter(a => a.verdict === "APPROVED").length;
        const divergentCount = audits.filter(a => a.verdict === "DIVERGENT").length;

        let consolidatedVerdict: "APPROVED" | "DIVERGENT" | "CRITICAL";
        if (hasCritical) {
            consolidatedVerdict = "CRITICAL";
        } else if (hasDivergent) {
            consolidatedVerdict = "DIVERGENT";
        } else {
            consolidatedVerdict = "APPROVED";
        }

        const allPositiveHighlights = audits.flatMap(a => 
            a.positive_highlights.map(h => `[${a.date_time_context}] ${h}`)
        );

        const allTechnicalDivergences = audits.flatMap(a => 
            a.technical_divergences.map(d => `[${a.date_time_context}] ${d}`)
        );

        const justificationParts: string[] = [];
        
        if (allPositiveHighlights.length > 0) {
            justificationParts.push("PONTOS POSITIVOS:\n" + allPositiveHighlights.map(h => `✅ ${h}`).join("\n"));
        }
        
        if (allTechnicalDivergences.length > 0) {
            justificationParts.push("DIVERGÊNCIAS TÉCNICAS:\n" + allTechnicalDivergences.map(d => `❌ ${d}`).join("\n"));
        }

        justificationParts.push("RESUMOS POR IMAGEM:\n" + audits.map(a => 
            `[${a.date_time_context}] ${a.final_summary}`
        ).join("\n\n"));

        const detailedJustification = justificationParts.join("\n\n");

        cases.push({
            lead_id: leadId,
            lead_name: name,
            images: audits,
            consolidated_verdict: consolidatedVerdict,
            has_critical_fail: hasCritical,
            all_positive_highlights: allPositiveHighlights,
            all_technical_divergences: allTechnicalDivergences,
            detailed_justification: detailedJustification,
            total_images: audits.length,
            approved_count: approvedCount,
            divergent_count: divergentCount
        });
    }

    return cases;
}

async function saveLeadCases(cases: LeadCase[]): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    
    const jsonPath = path.join(CONFIG.resultsFolder, `cases-${timestamp}.json`);
    await fs.writeJson(jsonPath, cases, { spaces: 2 });
    
    const csvHeader = "Lead ID,Lead Name,Total Images,Approved,Divergent,Verdict,Critical,Justification";
    const csvRows = cases.map(c => {
        const justification = c.detailed_justification.replace(/"/g, '""').replace(/\n/g, ' | ');
        return `"${c.lead_id}","${c.lead_name}",${c.total_images},${c.approved_count},${c.divergent_count},"${c.consolidated_verdict}",${c.has_critical_fail},"${justification}"`;
    });
    const csvPath = path.join(CONFIG.resultsFolder, `cases-${timestamp}.csv`);
    await fs.writeFile(csvPath, [csvHeader, ...csvRows].join("\n"));

    console.log(`\n📁 Lead Cases saved:`);
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   CSV:  ${csvPath}`);
}

// ============================================================================
// MAIN AUDIT WORKFLOW
// ============================================================================

async function processImage(
    file: string,
    genAI: GoogleGenerativeAI,
    rules: string
): Promise<{ leadId: string; leadName: string; audit: ImageAudit } | null> {
    console.log(`\n📸 Processing: ${file}`);

    const filePath = path.join(CONFIG.auditFolder, file);
    const imageBuffer = await fs.readFile(filePath);

    const response = await analyzeImage(genAI, imageBuffer, rules);
    const { metadata, audit } = response;

    console.log(`   👤 Lead: ${metadata.lead_name} | ID: ${metadata.lead_id}`);
    console.log(`   📅 Context: ${metadata.date_time_context}`);

    let icon: string;
    let label: string;
    if (audit.critical_fail) {
        icon = "🚨";
        label = "CRITICAL FAIL";
    } else if (audit.verdict === "APPROVED") {
        icon = "✅";
        label = "APPROVED";
    } else {
        icon = "❌";
        label = "DIVERGENT";
    }
    console.log(`   Result: ${icon} ${label}`);

    if (audit.positive_highlights.length > 0) {
        console.log(`   ✅ Highlights:`);
        for (const highlight of audit.positive_highlights.slice(0, 3)) {
            console.log(`      • ${highlight}`);
        }
    }

    if (audit.technical_divergences.length > 0) {
        console.log(`   ❌ Divergences:`);
        for (const divergence of audit.technical_divergences) {
            console.log(`      • ${divergence}`);
        }
    }

    console.log(`   📝 Summary: ${audit.final_summary.substring(0, 150)}...`);

    await moveToProcessed(filePath, CONFIG.doneFolder);
    console.log(`   📁 Moved to /done`);

    return {
        leadId: metadata.lead_id,
        leadName: metadata.lead_name,
        audit: {
            filename: file,
            date_time_context: metadata.date_time_context,
            verdict: audit.verdict,
            positive_highlights: audit.positive_highlights,
            technical_divergences: audit.technical_divergences,
            final_summary: audit.final_summary,
            critical_fail: audit.critical_fail,
            processed_at: new Date().toISOString()
        }
    };
}

async function run(): Promise<void> {
    console.log("═".repeat(60));
    console.log("  R3 Academia - AI Compliance Auditor (Case Aggregation)");
    console.log("═".repeat(60));

    const apiKey = loadEnv();
    const genAI = new GoogleGenerativeAI(apiKey);

    await fs.ensureDir(CONFIG.doneFolder);
    await fs.ensureDir(CONFIG.resultsFolder);

    if (!await fs.pathExists(CONFIG.rulesFile)) {
        console.error(`❌ Rules file not found: ${CONFIG.rulesFile}`);
        process.exit(1);
    }

    const rules = await fs.readFile(CONFIG.rulesFile, "utf-8");
    const files = await getImageFiles(CONFIG.auditFolder);

    if (files.length === 0) {
        console.log("\n📂 No images found in ./audits");
        console.log("   Add any screenshot (PNG/JPG) - filename doesn't matter");
        return;
    }

    console.log(`\n🔍 Found ${files.length} image(s) to audit`);
    console.log("─".repeat(60));

    const leadMap = new Map<string, { name: string; audits: ImageAudit[] }>();
    const stats: AuditStats = {
        total_images: 0,
        total_cases: 0,
        approved_cases: 0,
        divergent_cases: 0,
        critical_cases: 0,
        errors: 0
    };

    for (const file of files) {
        try {
            const result = await processImage(file, genAI, rules);
            if (result) {
                stats.total_images++;
                
                const existing = leadMap.get(result.leadId);
                if (existing) {
                    existing.audits.push(result.audit);
                    if (result.leadName !== "Unknown" && existing.name === "Unknown") {
                        existing.name = result.leadName;
                    }
                } else {
                    leadMap.set(result.leadId, {
                        name: result.leadName,
                        audits: [result.audit]
                    });
                }
            }
        } catch (error) {
            stats.errors++;
            const message = error instanceof Error ? error.message : String(error);
            console.error(`\n❌ Error processing ${file}: ${message}`);
        }
    }

    console.log("\n" + "═".repeat(60));
    console.log("  📊 Aggregating Lead Cases...");
    console.log("═".repeat(60));

    const cases = aggregateLeadCases(leadMap);
    stats.total_cases = cases.length;

    for (const leadCase of cases) {
        console.log(`\n📁 Case: ${leadCase.lead_name} (${leadCase.lead_id})`);
        console.log(`   Images: ${leadCase.total_images} | ✅ ${leadCase.approved_count} | ❌ ${leadCase.divergent_count}`);
        
        let icon: string;
        if (leadCase.consolidated_verdict === "CRITICAL") {
            icon = "🚨";
            stats.critical_cases++;
        } else if (leadCase.consolidated_verdict === "DIVERGENT") {
            icon = "❌";
            stats.divergent_cases++;
        } else {
            icon = "✅";
            stats.approved_cases++;
        }
        console.log(`   Verdict: ${icon} ${leadCase.consolidated_verdict}`);

        if (leadCase.all_positive_highlights.length > 0) {
            console.log(`   ✅ Key Highlights:`);
            for (const highlight of leadCase.all_positive_highlights.slice(0, 3)) {
                console.log(`      • ${highlight}`);
            }
            if (leadCase.all_positive_highlights.length > 3) {
                console.log(`      ... and ${leadCase.all_positive_highlights.length - 3} more`);
            }
        }

        if (leadCase.all_technical_divergences.length > 0) {
            console.log(`   ❌ Technical Issues:`);
            for (const issue of leadCase.all_technical_divergences.slice(0, 3)) {
                console.log(`      • ${issue}`);
            }
            if (leadCase.all_technical_divergences.length > 3) {
                console.log(`      ... and ${leadCase.all_technical_divergences.length - 3} more`);
            }
        }
    }

    if (cases.length > 0) {
        await saveLeadCases(cases);
    }

    console.log("\n" + "═".repeat(60));
    console.log("  📊 Final Summary");
    console.log("─".repeat(60));
    console.log(`  Total Images:    ${stats.total_images}`);
    console.log(`  Total Cases:     ${stats.total_cases}`);
    console.log("─".repeat(60));
    console.log(`  ✅ Approved:     ${stats.approved_cases} cases`);
    console.log(`  ❌ Divergent:    ${stats.divergent_cases} cases`);
    console.log(`  🚨 Critical:     ${stats.critical_cases} cases`);
    if (stats.errors > 0) {
        console.log(`  ⚠️  Errors:       ${stats.errors}`);
    }
    console.log("═".repeat(60));
}

run().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
